import { app, BrowserWindow, ipcMain } from 'electron';
const { db, generateContracts } = require('./database');
const { importFromMadden } = require('./importfromMadden');
const { simulateGame } = require('./simulateGame');

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// ─── Depth Chart Table ────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS depth_chart (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    position_group TEXT NOT NULL,
    slot INTEGER NOT NULL,
    UNIQUE(team_id, player_id),
    FOREIGN KEY (team_id) REFERENCES teams(id),
    FOREIGN KEY (player_id) REFERENCES players(id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS career_stats_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL,
    season INTEGER NOT NULL,
    games INTEGER DEFAULT 0,
    completions INTEGER DEFAULT 0,
    pass_attempts INTEGER DEFAULT 0,
    pass_yards INTEGER DEFAULT 0,
    pass_tds INTEGER DEFAULT 0,
    interceptions INTEGER DEFAULT 0,
    rush_attempts INTEGER DEFAULT 0,
    rush_yards INTEGER DEFAULT 0,
    rush_tds INTEGER DEFAULT 0,
    targets INTEGER DEFAULT 0,
    receptions INTEGER DEFAULT 0,
    rec_yards INTEGER DEFAULT 0,
    rec_tds INTEGER DEFAULT 0,
    UNIQUE(player_id, season)
  )
`);

// Migrate career_stats_history to include defensive stat columns
['tackles','assisted_tackles','forced_fumbles','fumble_recoveries',
 'def_interceptions','pass_deflections','def_tds'].forEach(col => {
  try { db.exec(`ALTER TABLE career_stats_history ADD COLUMN ${col} INTEGER DEFAULT 0`); } catch (_) {}
});
try { db.exec(`ALTER TABLE career_stats_history ADD COLUMN sacks REAL DEFAULT 0`); } catch (_) {}
try { db.exec(`ALTER TABLE career_stats_history ADD COLUMN tfl REAL DEFAULT 0`); } catch (_) {}

// Auto-balance rosters on startup if FA pool is empty
{
  const faCount = (db.prepare('SELECT COUNT(*) as count FROM players WHERE is_free_agent = 1').get() as any).count;
  if (faCount === 0) balanceRosters();
}

const POSITION_TO_GROUP: Record<string, string> = {
  QB: 'QB',
  RB: 'RB', HB: 'RB', FB: 'RB',
  WR: 'WR', TE: 'TE',
  LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL', OL: 'OL',
  LE: 'DL', RE: 'DL', DT: 'DL', IDL: 'DL', DL: 'DL',
  MLB: 'LB', OLB: 'LB', LOLB: 'LB', ROLB: 'LB', WILL: 'LB', MIKE: 'LB', LB: 'LB',
  CB: 'CB', FS: 'S', SS: 'S', S: 'S', K: 'K',
};

function initDepthChart(teamId: number) {
  const existing = (db.prepare('SELECT COUNT(*) as count FROM depth_chart WHERE team_id = ?').get(teamId) as any).count;
  if (existing > 0) return;
  const players = db.prepare(`
    SELECT id, position, position_label FROM players
    WHERE team_id = ? AND roster_status = 'active'
    ORDER BY overall_rating DESC
  `).all(teamId) as any[];
  const insert = db.prepare('INSERT OR IGNORE INTO depth_chart (team_id, player_id, position_group, slot) VALUES (?, ?, ?, ?)');
  const groupSlots: Record<string, number> = {};
  const run = db.transaction(() => {
    for (const p of players) {
      const pos = p.position_label || p.position;
      const group = POSITION_TO_GROUP[pos];
      if (!group) continue;
      groupSlots[group] = (groupSlots[group] ?? 0) + 1;
      insert.run(teamId, p.id, group, groupSlots[group]);
    }
  });
  run();
}

function balanceRosters() {
  const teams = db.prepare('SELECT id FROM teams').all() as any[];
  const run = db.transaction(() => {
    for (const team of teams) {
      const players = db.prepare(`
        SELECT id FROM players
        WHERE team_id = ? AND roster_status IN ('active', 'practice_squad')
        ORDER BY overall_rating DESC
      `).all(team.id) as any[];
      players.forEach((p: any, i: number) => {
        if (i < 53) {
          db.prepare(`UPDATE players SET roster_status = 'active' WHERE id = ?`).run(p.id);
        } else if (i < 69) {
          db.prepare(`UPDATE players SET roster_status = 'practice_squad' WHERE id = ?`).run(p.id);
        } else {
          db.prepare(`UPDATE players SET team_id = NULL, is_free_agent = 1, roster_status = 'free_agent' WHERE id = ?`).run(p.id);
          db.prepare('DELETE FROM contracts WHERE player_id = ?').run(p.id);
        }
      });
    }
  });
  run();
}

ipcMain.handle('balance-rosters', () => {
  balanceRosters();
  const faCount = (db.prepare('SELECT COUNT(*) as count FROM players WHERE is_free_agent = 1').get() as any).count;
  return { success: true, freeAgents: faCount };
});

if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    height: 700,
    width: 1200,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  mainWindow.webContents.openDevTools();
};

function getCurrentSeason(): number {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'current_season'").get() as any;
  return row ? parseInt(row.value) : 2025;
}

// ─── Market Rate Helper ───────────────────────────────────────────────────────

const MARKET_RATE_TABLE: Record<string, [number, number][]> = {
  QB: [[99,65],[93,50],[88,35],[83,20],[78,10],[73,4],[70,1.5]],
  WR: [[99,45],[93,35],[88,25],[83,16],[78,8],[73,3],[70,1.5]],
  DL: [[99,38],[93,30],[88,22],[83,14],[78,7],[73,3],[70,1.5]],
  CB: [[99,32],[93,25],[88,18],[83,11],[78,5],[73,2.5],[70,1.5]],
  OL: [[99,36],[93,30],[88,24],[83,18],[78,9],[73,3],[70,1.5]],
  LB: [[99,26],[93,20],[88,15],[83,9],[78,4.5],[73,2],[70,1.5]],
  TE: [[99,24],[93,19],[88,14],[83,8],[78,4],[73,2],[70,1.5]],
  S:  [[99,22],[93,17],[88,12],[83,7],[78,3.5],[73,1.8],[70,1.5]],
  RB: [[99,18],[93,14],[88,10],[83,6],[78,3],[73,1.5],[70,1.2]],
  K:  [[99,8],[93,6],[88,5],[83,4],[78,3],[73,2],[70,1]],
};
const TRAIT_MUL: Record<string, number> = { Normal: 1.0, Star: 1.1, Superstar: 1.25, 'X-Factor': 1.45 };

function calcFairMarket(ovr: number, position: string, devTrait: string): number {
  const rates = MARKET_RATE_TABLE[position] ?? MARKET_RATE_TABLE['LB'];
  let base = rates[rates.length - 1][1];
  for (let i = 0; i < rates.length - 1; i++) {
    const [highOvr, highSal] = rates[i];
    const [lowOvr, lowSal] = rates[i + 1];
    if (ovr >= lowOvr) {
      const t = (ovr - lowOvr) / (highOvr - lowOvr);
      base = lowSal + t * (highSal - lowSal);
      break;
    }
  }
  return Math.round(base * (TRAIT_MUL[devTrait] ?? 1.0) * 10) / 10;
}

// ─── Trade Value Helpers ──────────────────────────────────────────────────────

function calcPlayerTradeValue(overallRating: number, age: number, position: string, devTrait: string = 'Normal'): number {
  const ageFactor =
    age <= 23 ? 1.4 : age <= 26 ? 1.25 : age <= 29 ? 1.0 : age <= 32 ? 0.75 : age <= 35 ? 0.5 : 0.3;

  const posFactor: Record<string, number> = {
    QB: 1.4, CB: 1.15, DL: 1.15, LB: 1.1,
    WR: 1.1, TE: 1.1, OL: 1.05, S: 1.0, RB: 0.85, K: 0.7,
  };

  const traitFactor: Record<string, number> = {
    'Normal': 1.0, 'Star': 1.15, 'Superstar': 1.3, 'X-Factor': 1.5,
  };

  return Math.round(overallRating * ageFactor * (posFactor[position] ?? 1.0) * (traitFactor[devTrait] ?? 1.0));
}

function getPlayerAvailabilityPremium(player: { age: number; position: string; dev_trait: string }): number {
  const trait = player.dev_trait ?? 'Normal';
  let premium = 0;
  if (player.position === 'QB' && player.age <= 26) {
    premium += trait === 'X-Factor' ? 80 : trait === 'Superstar' ? 50 : trait === 'Star' ? 25 : 10;
  }
  if (player.age <= 25 && (trait === 'X-Factor' || trait === 'Superstar')) {
    premium += trait === 'X-Factor' ? 50 : 30;
  }
  if (player.age <= 25 && trait === 'Star') premium += 15;
  return premium;
}

function getTeamTradeProfile(teamId: number): {
  status: string; description: string; acceptanceThreshold: number;
  wins: number; losses: number; avgOverall: number;
} {
  const season = getCurrentSeason();
  const record = db.prepare(`
    SELECT
      SUM(CASE WHEN (home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score) THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN (home_team_id = ? AND home_score < away_score) OR (away_team_id = ? AND away_score < home_score) THEN 1 ELSE 0 END) as losses,
      COUNT(*) as games_played
    FROM games WHERE (home_team_id = ? OR away_team_id = ?) AND season = ? AND is_simulated = 1 AND is_playoff = 0
  `).get(teamId, teamId, teamId, teamId, teamId, teamId, season) as any;

  const ovrRow = db.prepare('SELECT AVG(overall_rating) as avg_ovr FROM players WHERE team_id = ?').get(teamId) as any;
  const wins = record?.wins ?? 0;
  const losses = record?.losses ?? 0;
  const gamesPlayed = record?.games_played ?? 0;
  const winPct = gamesPlayed >= 4 ? wins / gamesPlayed : 0.5;
  const avgOverall = Math.round(ovrRow?.avg_ovr ?? 75);

  let status: string, description: string, acceptanceThreshold: number;
  if (winPct >= 0.65 && avgOverall >= 78) {
    status = 'Contender'; description = 'Competing for a title — demands full value in any deal.'; acceptanceThreshold = -3;
  } else if (winPct >= 0.50 && avgOverall >= 76) {
    status = 'Buyer'; description = 'Looking to add a piece for a playoff push.'; acceptanceThreshold = -8;
  } else if (winPct < 0.40 && avgOverall >= 77) {
    status = 'Seller'; description = 'Moving veterans for future assets — open to dealing.'; acceptanceThreshold = -18;
  } else if (winPct < 0.45 && avgOverall < 77) {
    status = 'Rebuilding'; description = 'Tearing it down. Will move anyone for the right offer.'; acceptanceThreshold = -22;
  } else {
    status = 'Neutral'; description = 'No strong inclination to buy or sell right now.'; acceptanceThreshold = -8;
  }
  return { status, description, acceptanceThreshold, wins, losses, avgOverall };
}

// ─── Injury Helpers ───────────────────────────────────────────────────────────

const INJURY_TYPES = ['Hamstring', 'Ankle', 'Knee', 'Shoulder', 'Concussion', 'Rib', 'Back', 'Quad', 'Calf', 'Hand'];
const POS_INJURY_RISK: Record<string, number> = {
  QB: 0.025, RB: 0.055, WR: 0.035, TE: 0.035,
  OL: 0.020, DL: 0.025, LB: 0.035, CB: 0.035, S: 0.025, K: 0.008,
};

function rollInjuries(playerStats: any[]) {
  for (const stat of playerStats) {
    const player = db.prepare('SELECT position, injury_status FROM players WHERE id = ?').get(stat.player_id) as any;
    if (!player || player.injury_status !== 'healthy') continue;

    const risk = POS_INJURY_RISK[player.position] ?? 0.03;
    if (Math.random() > risk) continue;

    const rand = Math.random();
    let status: string, weeksOut: number;
    if (rand < 0.40) { status = 'questionable'; weeksOut = 1; }
    else if (rand < 0.72) { status = 'out'; weeksOut = Math.floor(Math.random() * 2) + 2; }
    else if (rand < 0.92) { status = 'out'; weeksOut = Math.floor(Math.random() * 3) + 3; }
    else { status = 'ir'; weeksOut = Math.floor(Math.random() * 5) + 4; }

    const injuryType = INJURY_TYPES[Math.floor(Math.random() * INJURY_TYPES.length)];
    db.prepare("UPDATE players SET injury_status = ?, weeks_out = ?, injury_type = ? WHERE id = ?")
      .run(status, weeksOut, injuryType, stat.player_id);
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-standings', (_event: any, season?: number) => {
  const s = season ?? getCurrentSeason();
  const teams = db.prepare('SELECT id, city, name, conference, division FROM teams').all();
  return teams.map((team: any) => {
    const wins = db.prepare(`SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND ((home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score))`).get(s, team.id, team.id).count;
    const losses = db.prepare(`SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND ((home_team_id = ? AND home_score < away_score) OR (away_team_id = ? AND away_score < home_score))`).get(s, team.id, team.id).count;
    return { ...team, wins, losses };
  });
});

ipcMain.handle('get-teams', () => {
  return db.prepare('SELECT * FROM teams ORDER BY conference, division, name').all();
});

ipcMain.handle('get-roster', (_event: any, teamId: number) => {
  return db.prepare(`
    SELECT id, first_name, last_name, position, position_label, overall_rating, age,
           speed, strength, awareness, dev_trait
    FROM players WHERE team_id = ?
    ORDER BY CASE position
      WHEN 'QB' THEN 1 WHEN 'RB' THEN 2 WHEN 'WR' THEN 3 WHEN 'TE' THEN 4
      WHEN 'OL' THEN 5 WHEN 'DL' THEN 6 WHEN 'LB' THEN 7 WHEN 'CB' THEN 8
      WHEN 'S' THEN 9 WHEN 'K' THEN 10 ELSE 11
    END, overall_rating DESC
  `).all(teamId);
});

ipcMain.handle('get-player-stats', (_event: any, playerId: number) => {
  const season = getCurrentSeason();
  return db.prepare(`
    SELECT COUNT(DISTINCT s.game_id) as games,
      SUM(s.pass_attempts) as pass_attempts, SUM(s.completions) as completions,
      SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds, SUM(s.interceptions) as interceptions,
      SUM(s.rush_attempts) as rush_attempts, SUM(s.rush_yards) as rush_yards, SUM(s.rush_tds) as rush_tds,
      SUM(s.targets) as targets, SUM(s.receptions) as receptions, SUM(s.rec_yards) as rec_yards, SUM(s.rec_tds) as rec_tds,
      SUM(s.tackles) as tackles, SUM(s.assisted_tackles) as assisted_tackles,
      SUM(s.sacks) as sacks, SUM(s.tfl) as tfl,
      SUM(s.def_interceptions) as def_interceptions, SUM(s.pass_deflections) as pass_deflections
    FROM stats s JOIN games g ON s.game_id = g.id WHERE s.player_id = ? AND g.season = ?
  `).get(playerId, season);
});

ipcMain.handle('get-player-career-stats', (_event: any, playerId: number) => {
  const live = db.prepare(`
    SELECT g.season,
      COUNT(DISTINCT s.game_id) as games,
      SUM(s.completions) as completions, SUM(s.pass_attempts) as pass_attempts,
      SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds,
      SUM(s.interceptions) as interceptions,
      SUM(s.rush_attempts) as rush_attempts, SUM(s.rush_yards) as rush_yards,
      SUM(s.rush_tds) as rush_tds,
      SUM(s.targets) as targets, SUM(s.receptions) as receptions,
      SUM(s.rec_yards) as rec_yards, SUM(s.rec_tds) as rec_tds,
      SUM(s.tackles) as tackles, SUM(s.assisted_tackles) as assisted_tackles,
      SUM(s.sacks) as sacks, SUM(s.tfl) as tfl,
      SUM(s.def_interceptions) as def_interceptions, SUM(s.pass_deflections) as pass_deflections
    FROM stats s JOIN games g ON s.game_id = g.id
    WHERE s.player_id = ? GROUP BY g.season
  `).all(playerId) as any[];

  const history = db.prepare(`
    SELECT season, games, completions, pass_attempts, pass_yards, pass_tds, interceptions,
           rush_attempts, rush_yards, rush_tds, targets, receptions, rec_yards, rec_tds,
           tackles, assisted_tackles, sacks, tfl, def_interceptions, pass_deflections
    FROM career_stats_history WHERE player_id = ?
  `).all(playerId) as any[];

  const liveSeasons = new Set(live.map((r: any) => r.season));
  const combined = [
    ...live,
    ...history.filter((r: any) => !liveSeasons.has(r.season)),
  ].sort((a: any, b: any) => b.season - a.season);

  return combined;
});

ipcMain.handle('get-schedule', (_event: any, season?: number) => {
  const s = season ?? getCurrentSeason();
  return db.prepare(`
    SELECT g.id, g.week, g.home_score, g.away_score,
           ht.city || ' ' || ht.name AS home_team, at.city || ' ' || at.name AS away_team
    FROM games g JOIN teams ht ON g.home_team_id = ht.id JOIN teams at ON g.away_team_id = at.id
    WHERE g.season = ? AND g.is_simulated = 1 ORDER BY g.week, g.id
  `).all(s);
});

ipcMain.handle('get-dashboard', (_event: any, season?: number) => {
  const s = season ?? getCurrentSeason();
  const topAFC = db.prepare(`
    SELECT t.city || ' ' || t.name AS team_name,
      SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score) OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score) OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0 END) AS losses
    FROM teams t JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
    WHERE g.season = ? AND g.is_simulated = 1 AND t.conference = 'AFC'
    GROUP BY t.id ORDER BY wins DESC LIMIT 5
  `).all(s);
  const topNFC = db.prepare(`
    SELECT t.city || ' ' || t.name AS team_name,
      SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score) OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score) OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0 END) AS losses
    FROM teams t JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
    WHERE g.season = ? AND g.is_simulated = 1 AND t.conference = 'NFC'
    GROUP BY t.id ORDER BY wins DESC LIMIT 5
  `).all(s);
  const recentGames = db.prepare(`
    SELECT g.week, g.home_score, g.away_score,
           ht.city || ' ' || ht.name AS home_team, at.city || ' ' || at.name AS away_team
    FROM games g JOIN teams ht ON g.home_team_id = ht.id JOIN teams at ON g.away_team_id = at.id
    WHERE g.season = ? AND g.is_simulated = 1 ORDER BY g.week DESC, g.id DESC LIMIT 8
  `).all(s);
  return { topAFC, topNFC, recentGames };
});

ipcMain.handle('get-stats', (_event: any, season?: number) => {
  const s = season ?? getCurrentSeason();
  const passing = db.prepare(`
    SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
      p.overall_rating, p.age, p.position, p.dev_trait,
      t.city || ' ' || t.name AS team_name,
      SUM(st.pass_yards) AS pass_yards, SUM(st.pass_tds) AS pass_tds,
      SUM(st.interceptions) AS interceptions, SUM(st.completions) AS completions,
      SUM(st.pass_attempts) AS pass_attempts
    FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.pass_attempts > 0 GROUP BY p.id ORDER BY pass_yards DESC LIMIT 15
  `).all(s);
  const rushing = db.prepare(`
    SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
      p.overall_rating, p.age, p.position, p.dev_trait,
      t.city || ' ' || t.name AS team_name,
      SUM(st.rush_yards) AS rush_yards, SUM(st.rush_tds) AS rush_tds,
      SUM(st.rush_attempts) AS rush_attempts
    FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.rush_attempts > 0 GROUP BY p.id ORDER BY rush_yards DESC LIMIT 15
  `).all(s);
  const receiving = db.prepare(`
    SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
      p.overall_rating, p.age, p.position, p.dev_trait,
      t.city || ' ' || t.name AS team_name,
      SUM(st.rec_yards) AS rec_yards, SUM(st.rec_tds) AS rec_tds,
      SUM(st.receptions) AS receptions, SUM(st.targets) AS targets
    FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.targets > 0 GROUP BY p.id ORDER BY rec_yards DESC LIMIT 15
  `).all(s);
  const tackles = db.prepare(`
    SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
      p.overall_rating, p.age, p.position, p.dev_trait,
      t.city || ' ' || t.name AS team_name,
      SUM(st.tackles) AS tackles, SUM(st.assisted_tackles) AS assisted_tackles,
      SUM(st.sacks) AS sacks, SUM(st.tfl) AS tfl,
      SUM(st.forced_fumbles) AS forced_fumbles
    FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.tackles > 0 GROUP BY p.id ORDER BY tackles DESC LIMIT 15
  `).all(s);
  const sacks = db.prepare(`
    SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
      p.overall_rating, p.age, p.position, p.dev_trait,
      t.city || ' ' || t.name AS team_name,
      SUM(st.sacks) AS sacks, SUM(st.tfl) AS tfl,
      SUM(st.forced_fumbles) AS forced_fumbles, SUM(st.tackles) AS tackles
    FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.sacks > 0 GROUP BY p.id ORDER BY sacks DESC LIMIT 15
  `).all(s);
  const defInterceptions = db.prepare(`
    SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
      p.overall_rating, p.age, p.position, p.dev_trait,
      t.city || ' ' || t.name AS team_name,
      SUM(st.def_interceptions) AS def_interceptions,
      SUM(st.pass_deflections) AS pass_deflections,
      SUM(st.def_tds) AS def_tds, SUM(st.tackles) AS tackles
    FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND (st.def_interceptions > 0 OR st.pass_deflections > 0) GROUP BY p.id ORDER BY def_interceptions DESC, pass_deflections DESC LIMIT 15
  `).all(s);
  return { passing, rushing, receiving, tackles, sacks, defInterceptions };
});

ipcMain.handle('simulate-playoffs', (_event: any, season?: number) => {
  const s = season ?? getCurrentSeason();
  db.prepare(`DELETE FROM stats WHERE game_id IN (SELECT id FROM games WHERE season = ? AND is_playoff = 1)`).run(s);
  db.prepare(`DELETE FROM games WHERE season = ? AND is_playoff = 1`).run(s);

  const seedTeams = (conf: string) => {
    const teams = db.prepare(`SELECT id, city, name FROM teams WHERE conference = ?`).all(conf);
    return teams.map((t: any) => {
      const wins = db.prepare(`SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND is_playoff = 0 AND ((home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score))`).get(s, t.id, t.id).count;
      return { ...t, wins };
    }).sort((a: any, b: any) => b.wins - a.wins).slice(0, 7);
  };

  const afcTeams = seedTeams('AFC');
  const nfcTeams = seedTeams('NFC');
  const insertGame = db.prepare(`INSERT INTO games (season, week, home_team_id, away_team_id, home_score, away_score, is_playoff, is_simulated) VALUES (?, ?, ?, ?, ?, ?, 1, 1)`);

  const simGame = (homeTeam: any, awayTeam: any, week: number) => {
    const result = simulateGame(homeTeam.id, awayTeam.id);
    insertGame.run(s, week, homeTeam.id, awayTeam.id, result.homeScore, result.awayScore);
    return { home: homeTeam, away: awayTeam, homeScore: result.homeScore, awayScore: result.awayScore, winner: result.homeScore > result.awayScore ? homeTeam : awayTeam };
  };

  const afcWC = [simGame(afcTeams[1], afcTeams[6], 18), simGame(afcTeams[2], afcTeams[5], 18), simGame(afcTeams[3], afcTeams[4], 18)];
  const nfcWC = [simGame(nfcTeams[1], nfcTeams[6], 18), simGame(nfcTeams[2], nfcTeams[5], 18), simGame(nfcTeams[3], nfcTeams[4], 18)];
  const afcDiv = [simGame(afcTeams[0], afcWC[2].winner, 19), simGame(afcWC[0].winner, afcWC[1].winner, 19)];
  const nfcDiv = [simGame(nfcTeams[0], nfcWC[2].winner, 19), simGame(nfcWC[0].winner, nfcWC[1].winner, 19)];
  const afcChamp = simGame(afcDiv[0].winner, afcDiv[1].winner, 20);
  const nfcChamp = simGame(nfcDiv[0].winner, nfcDiv[1].winner, 20);
  const superBowl = simGame(afcChamp.winner, nfcChamp.winner, 21);
  db.prepare('INSERT OR REPLACE INTO champions (season, team_id) VALUES (?, ?)').run(s, superBowl.winner.id);

  return {
    afc: { seeds: afcTeams, wildCard: afcWC, divisional: afcDiv, championship: afcChamp },
    nfc: { seeds: nfcTeams, wildCard: nfcWC, divisional: nfcDiv, championship: nfcChamp },
    superBowl,
  };
});

ipcMain.handle('get-playoffs', (_event: any, season?: number) => {
  const s = season ?? getCurrentSeason();
  return db.prepare(`
    SELECT g.week, g.home_score, g.away_score,
           ht.city || ' ' || ht.name AS home_team, at.city || ' ' || at.name AS away_team
    FROM games g JOIN teams ht ON g.home_team_id = ht.id JOIN teams at ON g.away_team_id = at.id
    WHERE g.season = ? AND g.is_playoff = 1 ORDER BY g.week, g.id
  `).all(s);
});

ipcMain.handle('get-champions', () => {
  return db.prepare(`
    SELECT c.season, t.city || ' ' || t.name AS team_name, t.conference
    FROM champions c JOIN teams t ON c.team_id = t.id ORDER BY c.season DESC
  `).all();
});

ipcMain.handle('get-seasons', () => {
  return db.prepare(`SELECT DISTINCT season FROM games WHERE is_simulated = 1 ORDER BY season DESC`).all().map((r: any) => r.season);
});

ipcMain.handle('get-current-season', () => getCurrentSeason());

ipcMain.handle('advance-season', () => {
  const current = getCurrentSeason();
  const next = current + 1;

  // Age every non-retired player including free agents
  db.prepare("UPDATE players SET age = age + 1 WHERE roster_status != 'retired'").run();

  const players = db.prepare(
    "SELECT id, age, overall_rating, speed, strength, awareness, dev_trait, position FROM players WHERE roster_status != 'retired'"
  ).all() as any[];

  const progressionTable: Record<string, Record<string, [number, number]>> = {
    young:   { Normal: [0, 1], Star: [1, 2], Superstar: [2, 3], 'X-Factor': [3, 4] },
    rising:  { Normal: [0, 1], Star: [0, 2], Superstar: [1, 2], 'X-Factor': [2, 3] },
    prime:   { Normal: [-1, 0], Star: [0, 1], Superstar: [0, 1], 'X-Factor': [0, 1] },
    decline: { Normal: [-2,-1], Star: [-1, 0], Superstar: [-1, 0], 'X-Factor': [-1, 0] },
    old:     { Normal: [-3,-2], Star: [-2,-1], Superstar: [-2,-1], 'X-Factor': [-1, 0] },
    veteran: { Normal: [-4,-3], Star: [-3,-2], Superstar: [-3,-2], 'X-Factor': [-2,-1] },
  };

  const updatePlayer = db.prepare('UPDATE players SET overall_rating = ?, speed = ?, awareness = ? WHERE id = ?');

  const progressPlayers = db.transaction(() => {
    for (const p of players) {
      const trait = p.dev_trait ?? 'Normal';
      const bracket =
        p.age <= 23 ? 'young' : p.age <= 26 ? 'rising' : p.age <= 29 ? 'prime' :
        p.age <= 32 ? 'decline' : p.age <= 35 ? 'old' : 'veteran';
      const [min, max] = progressionTable[bracket][trait] ?? [0, 0];
      const ovrChange = Math.floor(Math.random() * (max - min + 1)) + min;
      const newOvr = Math.max(40, Math.min(99, p.overall_rating + ovrChange));

      let speedChange = 0;
      if (p.age >= 34) speedChange = -(Math.floor(Math.random() * 2) + 1);
      else if (p.age >= 31 && Math.random() < 0.6) speedChange = -1;
      else if (p.age >= 29 && Math.random() < 0.2) speedChange = -1;
      const newSpeed = Math.max(40, Math.min(99, (p.speed ?? 70) + speedChange));

      let awarenessChange = 0;
      if (p.age <= 26 && Math.random() < 0.4) awarenessChange = 1;
      else if (p.age >= 35 && Math.random() < 0.3) awarenessChange = -1;
      const newAwareness = Math.max(40, Math.min(99, (p.awareness ?? 70) + awarenessChange));

      updatePlayer.run(newOvr, newSpeed, newAwareness, p.id);
    }
  });
  progressPlayers();

  // Dev trait regression AND breakout upgrades
  const setTrait = db.prepare('UPDATE players SET dev_trait = ? WHERE id = ?');
  const traitChanges = db.transaction(() => {
    for (const p of players) {
      const trait = p.dev_trait ?? 'Normal';
      const rand = Math.random();
      if (trait === 'X-Factor') {
        if (p.age >= 32 || p.overall_rating < 88 || rand < 0.04) setTrait.run('Superstar', p.id);
      } else if (trait === 'Superstar') {
        if (p.age >= 34 || p.overall_rating < 82 || rand < 0.05) setTrait.run('Star', p.id);
      } else if (trait === 'Star') {
        if (p.age >= 36 || p.overall_rating < 76 || rand < 0.06) setTrait.run('Normal', p.id);
        else if (p.age <= 27 && p.overall_rating >= 84 && rand < 0.05) setTrait.run('Superstar', p.id);
      } else {
        if (p.age <= 26 && p.overall_rating >= 76 && rand < 0.08) setTrait.run('Star', p.id);
        else if (p.age <= 24 && p.overall_rating >= 83 && rand < 0.04) setTrait.run('Superstar', p.id);
      }
    }
  });
  traitChanges();

  // Retirement — probabilistic by age
  const retireCandidates = db.prepare(
    "SELECT id, first_name, last_name, position, age, overall_rating FROM players WHERE age >= 33 AND roster_status != 'retired'"
  ).all() as any[];

  const retired: { name: string; position: string; age: number; ovr: number }[] = [];
  const retirePlayers = db.transaction(() => {
    for (const p of retireCandidates) {
      let chance =
        p.age >= 40 ? 0.95 :
        p.age >= 38 ? 0.75 :
        p.age >= 36 ? 0.40 :
        p.age >= 34 ? 0.18 : 0.07;
      if (p.overall_rating < 72) chance = Math.min(0.95, chance * 1.5);
      if (Math.random() < chance) {
        db.prepare("UPDATE players SET roster_status = 'retired', team_id = NULL, is_free_agent = 0 WHERE id = ?").run(p.id);
        db.prepare('DELETE FROM contracts WHERE player_id = ?').run(p.id);
        retired.push({ name: `${p.first_name} ${p.last_name}`, position: p.position, age: p.age, ovr: p.overall_rating });
      }
    }
  });
  retirePlayers();

  // ─── CPU Re-signing ────────────────────────────────────────────────────────
  // Before contracts expire, CPU teams try to keep their own players.
  // The user's team is excluded — the user handles their re-signings manually.
  const userTeamIdRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
  const userTeamId = userTeamIdRow ? parseInt(userTeamIdRow.value) : -1;

  const expiringCpuPlayers = db.prepare(`
    SELECT p.id, p.overall_rating, p.age, p.position, p.dev_trait, c.team_id
    FROM contracts c
    JOIN players p ON c.player_id = p.id
    WHERE c.years_remaining = 1
      AND c.team_id != ?
      AND p.roster_status = 'active'
  `).all(userTeamId) as any[];

  let cpuResigns = 0;
  const doResigns = db.transaction(() => {
    for (const p of expiringCpuPlayers) {
      // Re-sign probability scales with player quality
      const resignChance =
        p.overall_rating >= 88 ? 0.90 :
        p.overall_rating >= 82 ? 0.80 :
        p.overall_rating >= 75 ? 0.65 :
        p.overall_rating >= 70 ? 0.40 : 0.20;

      if (Math.random() < resignChance) {
        const fair = calcFairMarket(p.overall_rating, p.position, p.dev_trait);
        // CPU pays a small loyalty premium (0–10% over market)
        const salary = Math.round(fair * (1.0 + Math.random() * 0.10) * 10) / 10;
        const years = p.age <= 26 ? 3 : p.age <= 30 ? 2 : 1;
        db.prepare('UPDATE contracts SET years_total = ?, years_remaining = ?, annual_salary = ? WHERE player_id = ?')
          .run(years, years, salary, p.id);
        cpuResigns++;
      }
      // If not re-signed, the contract decrement below will release them to FA
    }
  });
  doResigns();

  // Decrement contract years, release expired players to free agency
  db.prepare('UPDATE contracts SET years_remaining = years_remaining - 1').run();
  const expiredPlayers = db.prepare('SELECT player_id FROM contracts WHERE years_remaining <= 0').all() as any[];
  const expireContracts = db.transaction(() => {
    for (const { player_id } of expiredPlayers) {
      db.prepare('DELETE FROM contracts WHERE player_id = ?').run(player_id);
      db.prepare("UPDATE players SET team_id = NULL, is_free_agent = 1, roster_status = 'free_agent' WHERE id = ?").run(player_id);
    }
  });
  expireContracts();

  // Clear injuries for new season
  db.prepare("UPDATE players SET injury_status = 'healthy', weeks_out = 0, injury_type = NULL").run();

  // Archive current season stats to career_stats_history before bumping the season
  db.prepare(`
    INSERT INTO career_stats_history (
      player_id, season, games,
      completions, pass_attempts, pass_yards, pass_tds, interceptions,
      rush_attempts, rush_yards, rush_tds,
      targets, receptions, rec_yards, rec_tds,
      tackles, assisted_tackles, sacks, tfl,
      forced_fumbles, fumble_recoveries, def_interceptions, pass_deflections, def_tds
    )
    SELECT s.player_id, g.season,
      COUNT(DISTINCT s.game_id),
      SUM(s.completions), SUM(s.pass_attempts), SUM(s.pass_yards),
      SUM(s.pass_tds), SUM(s.interceptions),
      SUM(s.rush_attempts), SUM(s.rush_yards), SUM(s.rush_tds),
      SUM(s.targets), SUM(s.receptions), SUM(s.rec_yards), SUM(s.rec_tds),
      SUM(s.tackles), SUM(s.assisted_tackles), SUM(s.sacks), SUM(s.tfl),
      SUM(s.forced_fumbles), SUM(s.fumble_recoveries),
      SUM(s.def_interceptions), SUM(s.pass_deflections), SUM(s.def_tds)
    FROM stats s JOIN games g ON s.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1
    GROUP BY s.player_id, g.season
    ON CONFLICT(player_id, season) DO UPDATE SET
      games = excluded.games,
      completions = excluded.completions, pass_attempts = excluded.pass_attempts,
      pass_yards = excluded.pass_yards, pass_tds = excluded.pass_tds,
      interceptions = excluded.interceptions, rush_attempts = excluded.rush_attempts,
      rush_yards = excluded.rush_yards, rush_tds = excluded.rush_tds,
      targets = excluded.targets, receptions = excluded.receptions,
      rec_yards = excluded.rec_yards, rec_tds = excluded.rec_tds,
      tackles = excluded.tackles, assisted_tackles = excluded.assisted_tackles,
      sacks = excluded.sacks, tfl = excluded.tfl,
      forced_fumbles = excluded.forced_fumbles, fumble_recoveries = excluded.fumble_recoveries,
      def_interceptions = excluded.def_interceptions,
      pass_deflections = excluded.pass_deflections, def_tds = excluded.def_tds
  `).run(current);

  db.prepare("UPDATE settings SET value = ? WHERE key = 'current_season'").run(String(next));

  return { nextSeason: next, retired, cpuResigns };
});

// ─── Week-by-Week Simulation ──────────────────────────────────────────────────

ipcMain.handle('generate-schedule', () => {
  const season = getCurrentSeason();
  const existing = (db.prepare('SELECT COUNT(*) as count FROM games WHERE season = ? AND is_playoff = 0').get(season) as any).count;
  if (existing > 0) return { alreadyExists: true, season };

  const teams = (db.prepare('SELECT id FROM teams').all() as any[]).map((t: any) => t.id);
  const insertGame = db.prepare('INSERT INTO games (season, week, home_team_id, away_team_id, is_simulated) VALUES (?, ?, ?, ?, 0)');

  const shuffledForByes = [...teams].sort(() => Math.random() - 0.5);
  const byeWeekMap: Record<number, number> = {};
  for (let i = 0; i < shuffledForByes.length; i++) {
    const byeWeek = 5 + Math.floor(i / 4);
    byeWeekMap[shuffledForByes[i]] = byeWeek;
  }

  const create = db.transaction(() => {
    for (let week = 1; week <= 18; week++) {
      const playing = teams.filter((id: number) => byeWeekMap[id] !== week);
      const shuffled = [...playing].sort(() => Math.random() - 0.5);
      const pairs = Math.floor(shuffled.length / 2);
      for (let i = 0; i < pairs; i++) {
        const home = shuffled[i * 2];
        const away = shuffled[i * 2 + 1];
        insertGame.run(season, week, home, away);
      }
    }
  });

  create();
  return { season, created: true, alreadyExists: false };
});

ipcMain.handle('get-current-week', () => {
  const season = getCurrentSeason();
  const total = (db.prepare('SELECT COUNT(*) as count FROM games WHERE season = ? AND is_playoff = 0').get(season) as any).count;
  if (total === 0) return { hasSchedule: false, currentWeek: null };
  const row = db.prepare(`SELECT MIN(week) as week FROM games WHERE season = ? AND is_simulated = 0 AND is_playoff = 0`).get(season) as any;
  return { hasSchedule: true, currentWeek: row?.week ?? null };
});

ipcMain.handle('get-week-matchups', (_event: any, week: number) => {
  const season = getCurrentSeason();
  return db.prepare(`
    SELECT g.id, g.week, g.home_score, g.away_score, g.is_simulated,
           ht.id as home_team_id, ht.city || ' ' || ht.name AS home_team,
           at.id as away_team_id, at.city || ' ' || at.name AS away_team
    FROM games g JOIN teams ht ON g.home_team_id = ht.id JOIN teams at ON g.away_team_id = at.id
    WHERE g.season = ? AND g.week = ? AND g.is_playoff = 0 ORDER BY g.id
  `).all(season, week);
});

ipcMain.handle('simulate-week', (_event: any, week: number) => {
  const season = getCurrentSeason();
  const games = db.prepare(`
    SELECT id, home_team_id, away_team_id FROM games
    WHERE season = ? AND week = ? AND is_simulated = 0 AND is_playoff = 0
  `).all(season, week) as any[];
  if (games.length === 0) return { week, season, gamesSimulated: 0 };

  db.prepare(`UPDATE players SET weeks_out = MAX(0, weeks_out - 1) WHERE weeks_out > 0`).run();
  db.prepare(`UPDATE players SET injury_status = 'healthy', injury_type = NULL WHERE weeks_out = 0 AND injury_status != 'healthy'`).run();

  const updateGame = db.prepare('UPDATE games SET home_score = ?, away_score = ?, is_simulated = 1 WHERE id = ?');
  const insertStat = db.prepare(`
    INSERT INTO stats (game_id, player_id, team_id, pass_attempts, completions, pass_yards, pass_tds,
      interceptions, rush_attempts, rush_yards, rush_tds, targets, receptions, rec_yards, rec_tds,
      tackles, assisted_tackles, sacks, tfl, forced_fumbles, fumble_recoveries,
      def_interceptions, pass_deflections, def_tds)
    VALUES (@game_id, @player_id, @team_id, @pass_attempts, @completions, @pass_yards, @pass_tds,
      @interceptions, @rush_attempts, @rush_yards, @rush_tds, @targets, @receptions, @rec_yards, @rec_tds,
      @tackles, @assisted_tackles, @sacks, @tfl, @forced_fumbles, @fumble_recoveries,
      @def_interceptions, @pass_deflections, @def_tds)
  `);

  const allStats: any[] = [];

  const runWeek = db.transaction(() => {
    for (const game of games) {
      const result = simulateGame(game.home_team_id, game.away_team_id);
      updateGame.run(result.homeScore, result.awayScore, game.id);
      for (const stat of [...result.homePlayerStats, ...result.awayPlayerStats]) {
        insertStat.run({ game_id: game.id, ...stat });
        allStats.push(stat);
      }
    }
  });
  runWeek();

  rollInjuries(allStats);

  return { week, season, gamesSimulated: games.length };
});

ipcMain.handle('get-injury-report', (_event: any, teamId: number) => {
  return db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
           p.overall_rating, p.age, p.dev_trait,
           p.injury_status, p.weeks_out, p.injury_type
    FROM players p
    WHERE p.team_id = ? AND p.injury_status != 'healthy'
    ORDER BY CASE p.injury_status WHEN 'ir' THEN 1 WHEN 'out' THEN 2 ELSE 3 END, p.overall_rating DESC
  `).all(teamId);
});

ipcMain.handle('get-game-box-score', (_event: any, gameId: number) => {
  const game = db.prepare(`
    SELECT g.id, g.week, g.home_score, g.away_score,
           ht.id as home_team_id, ht.city || ' ' || ht.name AS home_team,
           at.id as away_team_id, at.city || ' ' || at.name AS away_team
    FROM games g JOIN teams ht ON g.home_team_id = ht.id JOIN teams at ON g.away_team_id = at.id WHERE g.id = ?
  `).get(gameId) as any;
  if (!game) return null;
  const players = db.prepare(`
    SELECT p.first_name || ' ' || p.last_name as player_name, p.position, s.team_id,
           s.pass_attempts, s.completions, s.pass_yards, s.pass_tds, s.interceptions,
           s.rush_attempts, s.rush_yards, s.rush_tds, s.targets, s.receptions, s.rec_yards, s.rec_tds
    FROM stats s JOIN players p ON s.player_id = p.id
    WHERE s.game_id = ? AND (s.pass_yards > 0 OR s.rush_yards > 0 OR s.rec_yards > 0)
    ORDER BY s.team_id, s.pass_yards DESC, s.rush_yards DESC, s.rec_yards DESC
  `).all(gameId);
  return { game, players };
});

ipcMain.handle('reset-dynasty', () => {
  const pathModule = require('path');
  const csvPath = pathModule.join(app.getAppPath(), 'src', 'madden-ratings.csv');
  db.prepare('DELETE FROM stats').run();
  db.prepare('DELETE FROM games').run();
  db.prepare('DELETE FROM champions').run();
  db.prepare('DELETE FROM contracts').run();
  db.prepare('DELETE FROM depth_chart').run();
  db.prepare('DELETE FROM draft_prospects').run();
  db.prepare('DELETE FROM career_stats_history').run();
  importFromMadden(csvPath);
  db.prepare("UPDATE settings SET value = '2025' WHERE key = 'current_season'").run();
  generateContracts();
  balanceRosters();
  return { success: true };
});

ipcMain.handle('get-playoff-seeds', () => {
  const season = getCurrentSeason();
  const getConferenceSeeds = (conference: string) => {
    const teams = db.prepare('SELECT id, city, name FROM teams WHERE conference = ?').all(conference) as any[];
    return teams.map((t: any) => {
      const wins = (db.prepare(`SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND is_playoff = 0 AND ((home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score))`).get(season, t.id, t.id) as any).count;
      const losses = (db.prepare(`SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND is_playoff = 0 AND ((home_team_id = ? AND home_score < away_score) OR (away_team_id = ? AND away_score < home_score))`).get(season, t.id, t.id) as any).count;
      return { ...t, wins, losses, team_name: `${t.city} ${t.name}` };
    }).sort((a: any, b: any) => b.wins - a.wins).slice(0, 7);
  };
  return { afc: getConferenceSeeds('AFC'), nfc: getConferenceSeeds('NFC') };
});

ipcMain.handle('get-user-team', () => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
  if (!row) return null;
  const teamId = parseInt(row.value);
  return db.prepare('SELECT * FROM teams WHERE id = ?').get(teamId) ?? null;
});

ipcMain.handle('set-user-team', (_event: any, teamId: number) => {
  const existing = db.prepare("SELECT * FROM settings WHERE key = 'user_team_id'").get();
  if (existing) {
    db.prepare("UPDATE settings SET value = ? WHERE key = 'user_team_id'").run(String(teamId));
  } else {
    db.prepare("INSERT INTO settings (key, value) VALUES ('user_team_id', ?)").run(String(teamId));
  }
  return { success: true };
});

// ─── Team Status ──────────────────────────────────────────────────────────────

ipcMain.handle('get-team-status', (_event: any, teamId: number) => {
  return getTeamTradeProfile(teamId);
});

// ─── Trades ───────────────────────────────────────────────────────────────────

ipcMain.handle('propose-trade', (_event: any, { myPlayerIds, theirPlayerIds, theirTeamId }: {
  myPlayerIds: number[]; theirPlayerIds: number[]; theirTeamId: number;
}) => {
  const myTeamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
  if (!myTeamRow) return { accepted: false, reason: 'No franchise selected.' };
  const myTeamId = parseInt(myTeamRow.value);

  const myPlayers = myPlayerIds.map(id =>
    db.prepare('SELECT id, first_name, last_name, overall_rating, age, position, dev_trait FROM players WHERE id = ? AND team_id = ?').get(id, myTeamId)
  ).filter(Boolean) as any[];

  const theirPlayers = theirPlayerIds.map(id =>
    db.prepare('SELECT id, first_name, last_name, overall_rating, age, position, dev_trait FROM players WHERE id = ? AND team_id = ?').get(id, theirTeamId)
  ).filter(Boolean) as any[];

  if (myPlayers.length === 0 || theirPlayers.length === 0) return { accepted: false, reason: 'Invalid players selected.' };

  const myValue = myPlayers.reduce((sum: number, p: any) => sum + calcPlayerTradeValue(p.overall_rating, p.age, p.position, p.dev_trait), 0);
  const theirValue = theirPlayers.reduce((sum: number, p: any) => sum + calcPlayerTradeValue(p.overall_rating, p.age, p.position, p.dev_trait), 0);

  const valueDiff = myValue - theirValue;
  const randomFactor = Math.floor(Math.random() * 11) - 5;
  const profile = getTeamTradeProfile(theirTeamId);
  const availabilityPremium = theirPlayers.reduce((sum: number, p: any) => sum + getPlayerAvailabilityPremium(p), 0);
  const effectiveThreshold = profile.acceptanceThreshold + availabilityPremium;
  const accepted = (valueDiff + randomFactor) >= effectiveThreshold;

  if (accepted) {
    const executeTrade = db.transaction(() => {
      for (const p of myPlayers) {
        db.prepare('UPDATE players SET team_id = ? WHERE id = ?').run(theirTeamId, p.id);
        db.prepare('UPDATE contracts SET team_id = ? WHERE player_id = ?').run(theirTeamId, p.id);
      }
      for (const p of theirPlayers) {
        db.prepare('UPDATE players SET team_id = ? WHERE id = ?').run(myTeamId, p.id);
        db.prepare('UPDATE contracts SET team_id = ? WHERE player_id = ?').run(myTeamId, p.id);
      }
    });
    executeTrade();
    return { accepted: true };
  }

  const reason =
    availabilityPremium > 40 ? 'That player is a cornerstone of our franchise — not available at any reasonable price.' :
    availabilityPremium > 0 ? "We're protective of that player. You'll need to significantly sweeten the offer." :
    valueDiff < -20 ? "Not enough value — we need significantly more to make this work." :
    valueDiff < -10 ? "The offer is too light for us right now." :
    "We're not interested at this time.";
  return { accepted: false, reason };
});

// ─── Contracts ────────────────────────────────────────────────────────────────

ipcMain.handle('get-team-contracts', (_event: any, teamId: number) => {
  return db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
           p.overall_rating, p.age, p.dev_trait, p.roster_status,
           c.annual_salary, c.years_remaining, c.years_total,
           c.guaranteed_amount, c.guaranteed_pct,
           c.id as contract_id
    FROM contracts c
    JOIN players p ON c.player_id = p.id
    WHERE c.team_id = ? AND p.roster_status = 'active'
    ORDER BY c.annual_salary DESC
  `).all(teamId);
});

ipcMain.handle('get-practice-squad', (_event: any, teamId: number) => {
  return db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
           p.overall_rating, p.age, p.dev_trait,
           c.annual_salary, c.years_remaining
    FROM players p
    LEFT JOIN contracts c ON c.player_id = p.id
    WHERE p.team_id = ? AND p.roster_status = 'practice_squad'
    ORDER BY p.overall_rating DESC
  `).all(teamId);
});

ipcMain.handle('get-cap-summary', (_event: any, teamId: number) => {
  const SALARY_CAP = 279.2;
  const result = db.prepare(`
    SELECT COALESCE(SUM(c.annual_salary), 0) as used_cap
    FROM contracts c
    JOIN players p ON c.player_id = p.id
    WHERE c.team_id = ? AND p.roster_status = 'active'
  `).get(teamId) as any;
  const usedCap = Math.round(result.used_cap * 10) / 10;
  return {
    total_cap: SALARY_CAP,
    used_cap: usedCap,
    available_cap: Math.round((SALARY_CAP - usedCap) * 10) / 10,
  };
});

ipcMain.handle('get-roster-spots', (_event: any, teamId: number) => {
  const counts = db.prepare(`
    SELECT roster_status, COUNT(*) as count
    FROM players WHERE team_id = ? GROUP BY roster_status
  `).all(teamId) as any[];
  const active = counts.find((r: any) => r.roster_status === 'active')?.count ?? 0;
  const ps = counts.find((r: any) => r.roster_status === 'practice_squad')?.count ?? 0;
  return { active, ps, activeMax: 53, psMax: 16, activeFree: 53 - active, psFree: 16 - ps };
});

ipcMain.handle('get-free-agents', (_event: any, position?: string) => {
  const query = position && position !== 'ALL'
    ? "SELECT id, first_name, last_name, position, position_label, overall_rating, age, dev_trait FROM players WHERE is_free_agent = 1 AND position = ? ORDER BY overall_rating DESC LIMIT 200"
    : "SELECT id, first_name, last_name, position, position_label, overall_rating, age, dev_trait FROM players WHERE is_free_agent = 1 ORDER BY overall_rating DESC LIMIT 200";
  return position && position !== 'ALL'
    ? db.prepare(query).all(position)
    : db.prepare(query).all();
});

ipcMain.handle('extend-player', (_event: any, { playerId, years, salary }: {
  playerId: number; years: number; salary: number;
}) => {
  const contract = db.prepare('SELECT * FROM contracts WHERE player_id = ?').get(playerId) as any;
  if (!contract) return { success: false, reason: 'No contract found.' };
  const guaranteedPct = Math.round(40 + Math.random() * 20);
  const guaranteedAmount = Math.round(salary * years * (guaranteedPct / 100) * 10) / 10;
  db.prepare('UPDATE contracts SET years_total = ?, years_remaining = ?, annual_salary = ?, guaranteed_amount = ?, guaranteed_pct = ? WHERE player_id = ?')
    .run(years, years, salary, guaranteedAmount, guaranteedPct, playerId);
  return { success: true };
});

ipcMain.handle('release-player', (_event: any, playerId: number) => {
  db.prepare('DELETE FROM contracts WHERE player_id = ?').run(playerId);
  db.prepare("UPDATE players SET team_id = NULL, is_free_agent = 1, roster_status = 'free_agent' WHERE id = ?").run(playerId);
  return { success: true };
});

ipcMain.handle('promote-from-ps', (_event: any, playerId: number) => {
  const teamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
  if (!teamRow) return { success: false, reason: 'No franchise selected.' };
  const teamId = parseInt(teamRow.value);

  const active = (db.prepare("SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'active'").get(teamId) as any).count;
  if (active >= 53) return { success: false, reason: 'Active roster is full (53/53). Release a player first.' };

  const player = db.prepare('SELECT * FROM players WHERE id = ? AND roster_status = ?').get(playerId, 'practice_squad') as any;
  if (!player) return { success: false, reason: 'Player not on practice squad.' };

  db.prepare("UPDATE players SET roster_status = 'active' WHERE id = ?").run(playerId);

  const SAL_RANGES: Record<string, [number, number]> = {
    QB: [1.0, 42], WR: [1.0, 28], DL: [1.0, 32], LB: [1.0, 18],
    CB: [1.0, 22], TE: [1.0, 16], OL: [1.0, 22], S: [1.0, 18],
    RB: [1.0, 16], K: [1.0, 4],
  };
  const [minSal, maxSal] = SAL_RANGES[player.position] ?? [1.0, 10];
  const ovrFactor = Math.pow(Math.max(0, (player.overall_rating - 70)) / 29, 2.5);
  const salary = Math.round((minSal + ovrFactor * (maxSal - minSal)) * 10) / 10;
  const years = player.age <= 25 ? 3 : player.age <= 29 ? 2 : 1;

  const existing = db.prepare('SELECT id FROM contracts WHERE player_id = ?').get(playerId);
  if (existing) {
    db.prepare('UPDATE contracts SET years_total = ?, years_remaining = ?, annual_salary = ?, guaranteed_amount = ?, guaranteed_pct = ? WHERE player_id = ?')
      .run(years, years, salary, Math.round(salary * years * 0.3 * 10) / 10, 30, playerId);
  } else {
    db.prepare('INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(playerId, teamId, years, years, salary, Math.round(salary * years * 0.3 * 10) / 10, 30);
  }

  return { success: true, name: `${player.first_name} ${player.last_name}` };
});

ipcMain.handle('sign-free-agent', (_event: any, { playerId, years, salary }: {
  playerId: number; years: number; salary: number;
}) => {
  const teamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
  if (!teamRow) return { success: false, reason: 'No franchise selected.' };
  const teamId = parseInt(teamRow.value);

  const spots = (db.prepare("SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'active'").get(teamId) as any).count;
  if (spots >= 53) return { success: false, reason: 'Active roster is full (53/53). Release a player first.' };

  const player = db.prepare('SELECT id, overall_rating, age, position, dev_trait FROM players WHERE id = ?').get(playerId) as any;
  if (!player) return { success: false, reason: 'Player not found.' };

  const fairMarket = calcFairMarket(player.overall_rating, player.position, player.dev_trait);
  const ratio = salary / Math.max(fairMarket, 1);

  let acceptChance =
    ratio >= 1.00 ? 1.00 :
    ratio >= 0.85 ? 0.90 :
    ratio >= 0.70 ? 0.60 :
    ratio >= 0.50 ? 0.20 : 0.00;

  if (player.age >= 33) acceptChance = Math.min(1, acceptChance + 0.15);
  if (player.age >= 36) acceptChance = Math.min(1, acceptChance + 0.15);
  if (player.dev_trait === 'X-Factor') acceptChance = Math.max(0, acceptChance - 0.20);
  if (player.dev_trait === 'Superstar') acceptChance = Math.max(0, acceptChance - 0.10);

  const season = getCurrentSeason();
  const record = db.prepare(`
    SELECT
      SUM(CASE WHEN (home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score) THEN 1 ELSE 0 END) as wins,
      COUNT(*) as played
    FROM games WHERE (home_team_id = ? OR away_team_id = ?) AND season = ? AND is_simulated = 1 AND is_playoff = 0
  `).get(teamId, teamId, teamId, teamId, season) as any;
  const winPct = record?.played >= 4 ? record.wins / record.played : 0.5;
  if (winPct >= 0.65) acceptChance = Math.min(1, acceptChance + 0.08);

  const accepted = Math.random() < acceptChance;

  if (!accepted) {
    const reason =
      ratio < 0.50 ? `Insulted by the offer. ${player.dev_trait === 'X-Factor' || player.dev_trait === 'Superstar' ? 'Elite players' : 'Players'} don't sign for that salary.` :
      ratio < 0.70 ? `Not enough money. Looking for closer to ${fairMarket.toFixed(1)}M/yr on the open market.` :
      ratio < 0.85 ? `Decided to explore other options. Try sweetening the offer slightly.` :
      `Chose to sign elsewhere. Sometimes it just doesn't work out.`;
    return { success: false, reason };
  }

  const guaranteedPct = Math.round(30 + Math.random() * 30);
  const guaranteedAmount = Math.round(salary * years * (guaranteedPct / 100) * 10) / 10;

  db.prepare("UPDATE players SET team_id = ?, is_free_agent = 0, roster_status = 'active' WHERE id = ?").run(teamId, playerId);
  db.prepare(`INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(playerId, teamId, years, years, salary, guaranteedAmount, guaranteedPct);
  return { success: true };
});

ipcMain.handle('get-expiring-contracts', () => {
  const teamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
  if (!teamRow) return [];
  const teamId = parseInt(teamRow.value);
  return db.prepare(`
    SELECT p.id, p.first_name, p.last_name, p.position, p.position_label,
           p.overall_rating, p.age, p.dev_trait,
           c.annual_salary, c.years_remaining, c.years_total,
           c.guaranteed_amount, c.guaranteed_pct, c.id as contract_id
    FROM contracts c
    JOIN players p ON c.player_id = p.id
    WHERE c.team_id = ? AND p.roster_status = 'active' AND c.years_remaining = 1
    ORDER BY c.annual_salary DESC
  `).all(teamId);
});

ipcMain.handle('resign-player', (_event: any, { playerId, years, salary }: {
  playerId: number; years: number; salary: number;
}) => {
  const player = db.prepare('SELECT id, overall_rating, age, position, dev_trait FROM players WHERE id = ?').get(playerId) as any;
  if (!player) return { success: false, reason: 'Player not found.' };

  const fairMarket = calcFairMarket(player.overall_rating, player.position, player.dev_trait);
  const ratio = salary / Math.max(fairMarket, 1);

  let acceptChance =
    ratio >= 1.00 ? 1.00 :
    ratio >= 0.85 ? 0.95 :
    ratio >= 0.70 ? 0.70 :
    ratio >= 0.50 ? 0.25 : 0.00;

  if (player.age >= 33) acceptChance = Math.min(1, acceptChance + 0.15);
  if (player.age >= 36) acceptChance = Math.min(1, acceptChance + 0.15);
  if (player.dev_trait === 'X-Factor') acceptChance = Math.max(0, acceptChance - 0.15);
  if (player.dev_trait === 'Superstar') acceptChance = Math.max(0, acceptChance - 0.08);

  const accepted = Math.random() < acceptChance;

  if (!accepted) {
    const reason =
      ratio < 0.50 ? `Insulted by the offer. Looking for around ${fairMarket.toFixed(1)}M/yr.` :
      ratio < 0.70 ? `Not enough to stay. Asking price is closer to ${fairMarket.toFixed(1)}M/yr.` :
      ratio < 0.85 ? `Wants to test the market. Try offering closer to ${fairMarket.toFixed(1)}M/yr.` :
      `Decided to explore other options despite the offer.`;
    return { success: false, reason, willHitFA: true };
  }

  const guaranteedPct = Math.round(35 + Math.random() * 25);
  const guaranteedAmount = Math.round(salary * years * (guaranteedPct / 100) * 10) / 10;
  db.prepare('UPDATE contracts SET years_total = ?, years_remaining = ?, annual_salary = ?, guaranteed_amount = ?, guaranteed_pct = ? WHERE player_id = ?')
    .run(years, years, salary, guaranteedAmount, guaranteedPct, playerId);
  return { success: true };
});

ipcMain.handle('get-offseason-status', () => {
  const teamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
  const season = getCurrentSeason();
  const champion = db.prepare('SELECT team_id FROM champions WHERE season = ?').get(season);
  const draftGenerated = champion
    ? (db.prepare('SELECT COUNT(*) as count FROM draft_prospects WHERE season = ?').get(season) as any).count > 0
    : false;
  const draftComplete = draftGenerated
    ? (db.prepare('SELECT COUNT(*) as count FROM draft_prospects WHERE season = ? AND is_drafted = 0').get(season) as any).count === 0
    : false;
  if (!teamRow) return { playoffsComplete: !!champion, pendingResigns: 0, draftGenerated, draftComplete };
  const teamId = parseInt(teamRow.value);
  const pending = (db.prepare(`
    SELECT COUNT(*) as count FROM contracts c
    JOIN players p ON c.player_id = p.id
    WHERE c.team_id = ? AND p.roster_status = 'active' AND c.years_remaining = 1
  `).get(teamId) as any).count;
  return { playoffsComplete: !!champion, pendingResigns: pending, draftGenerated, draftComplete };
});

// ─── CPU Free Agency ──────────────────────────────────────────────────────────
// CPU teams scan for thin positions and sign the best available free agents.
// Call this from the frontend after the user has finished their own FA signings.

ipcMain.handle('cpu-fa-signing', () => {
  const userTeamIdRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
  const userTeamId = userTeamIdRow ? parseInt(userTeamIdRow.value) : -1;

  // Minimum roster thresholds per position group
  const MIN_ROSTER: Record<string, number> = {
    QB: 2, RB: 3, WR: 4, TE: 2, OL: 6, DL: 4, LB: 4, CB: 4, S: 2, K: 1,
  };

  const cpuTeams = db.prepare('SELECT id FROM teams WHERE id != ?').all(userTeamId) as any[];
  let totalSigned = 0;
  const signingsByTeam: Record<number, number> = {};

  const runSignings = db.transaction(() => {
    for (const team of cpuTeams) {
      const activeCount = (db.prepare("SELECT COUNT(*) as cnt FROM players WHERE team_id = ? AND roster_status = 'active'").get(team.id) as any).cnt;
      let slotsLeft = 53 - activeCount;
      if (slotsLeft <= 0) continue;

      const posCounts = db.prepare(`
        SELECT position, COUNT(*) as cnt
        FROM players WHERE team_id = ? AND roster_status = 'active'
        GROUP BY position
      `).all(team.id) as any[];
      const byPos: Record<string, number> = {};
      for (const r of posCounts) byPos[r.position] = r.cnt;

      let teamSigned = 0;
      for (const [pos, minCount] of Object.entries(MIN_ROSTER)) {
        if (slotsLeft <= 0) break;
        const current = byPos[pos] ?? 0;
        const needed = Math.max(0, minCount - current);

        for (let i = 0; i < needed && slotsLeft > 0; i++) {
          const fa = db.prepare(`
            SELECT id, overall_rating, age, position, dev_trait
            FROM players WHERE is_free_agent = 1 AND position = ?
            ORDER BY overall_rating DESC LIMIT 1
          `).get(pos) as any;
          if (!fa) break;

          const fair = calcFairMarket(fa.overall_rating, fa.position, fa.dev_trait);
          // CPU signs at 90–105% of market
          const salary = Math.round(fair * (0.90 + Math.random() * 0.15) * 10) / 10;
          const years = fa.age <= 27 ? 2 : 1;
          const gtd = Math.round(salary * years * 0.30 * 10) / 10;

          db.prepare("UPDATE players SET team_id = ?, is_free_agent = 0, roster_status = 'active' WHERE id = ?")
            .run(team.id, fa.id);
          db.prepare(`
            INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct)
            VALUES (?, ?, ?, ?, ?, ?, 30)
          `).run(fa.id, team.id, years, years, salary, gtd);

          totalSigned++;
          teamSigned++;
          slotsLeft--;
        }
      }
      if (teamSigned > 0) signingsByTeam[team.id] = teamSigned;
    }
  });
  runSignings();

  const teamsActive = Object.keys(signingsByTeam).length;
  return { totalSigned, teamsActive };
});

// ─── Draft ────────────────────────────────────────────────────────────────────

ipcMain.handle('generate-draft-class', () => {
  const season = getCurrentSeason();
  const existing = (db.prepare('SELECT COUNT(*) as count FROM draft_prospects WHERE season = ?').get(season) as any).count;
  if (existing > 0) return { already: true, count: existing };

  const FIRST = ['James','John','Robert','Michael','David','William','Joseph','Thomas','Charles','Christopher','Daniel','Matthew','Anthony','Mark','Steven','Paul','Andrew','Joshua','Kenneth','Kevin','Brian','Timothy','Jason','Jeffrey','Ryan','Jacob','Gary','Nicholas','Eric','Jonathan','Justin','Scott','Brandon','Benjamin','Samuel','Nathan','Zachary','Peter','Kyle','Noah','Ethan','Jeremy','Austin','Sean','Dylan','Jordan','Jesse','Bryan','Gabriel','Logan','Marcus','Malik','Darius','Terrell','Jamal','Xavier','Darnell','Lamar','Kendall','Jaylen','Jalen','Devonte','Trey','Kameron','Zion','Isaiah','Damien','Dominic','Julian','Elijah','Tyrese','DeAndre','Rashad','Corey','Marquise','Deon','Alonzo','Deshawn','Marquez','Keanu','Trevon','Devin','Javon','Treylon','Brock','Bryce','Drake','Garrett','Caleb','Quinton','Jaylon','Dontae','Tariq','Amon','Romeo','Tyjae'];
  const LAST = ['Smith','Johnson','Williams','Jones','Brown','Davis','Miller','Wilson','Moore','Taylor','Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Garcia','Robinson','Clark','Lewis','Lee','Walker','Hall','Allen','Young','King','Wright','Hill','Scott','Green','Adams','Baker','Nelson','Carter','Mitchell','Roberts','Turner','Phillips','Campbell','Parker','Evans','Edwards','Collins','Stewart','Morris','Rogers','Reed','Cook','Morgan','Bell','Murphy','Bailey','Cooper','Richardson','Cox','Howard','Ward','Peterson','Gray','James','Watson','Brooks','Kelly','Sanders','Price','Bennett','Wood','Barnes','Ross','Henderson','Coleman','Jenkins','Perry','Powell','Long','Patterson','Hughes','Washington','Butler','Simmons','Foster','Bryant','Alexander','Russell','Griffin','Hayes','Ford','Hamilton','Graham','Sullivan','Wallace','Woods','Cole','West','Jordan','Owens','Reynolds','Fisher','Harrison','Gibson','McDonald','Marshall','Murray','Freeman','Wells','Tucker','Porter','Hunter','Hicks','Henry','Boyd','Mason','Kennedy','Warren','Burns','Gordon','Shaw','Holmes','Rice','Robertson','Hunt','Daniels','Palmer','Nichols','Grant','Knight','Ferguson','Stone','Hawkins','Perkins','Hudson','Spencer','Gardner','Payne','Pierce','Berry','Matthews','Willis','Ray','Watkins','Carroll','Duncan','Hart','Cunningham','Bradley','Andrews','Harper','Fox','Riley','Armstrong','Greene','Lawrence','Elliott','Sims','Morrow','Ingram','Bates','Flowers','Moss','Lamb'];
  const POS_POOL = ['QB','RB','WR','WR','WR','TE','OL','OL','OL','DL','DL','DL','LB','LB','CB','CB','S','K'];

  const getDevTrait = (ovr: number): string => {
    const r = Math.random();
    if (ovr >= 78) return r < 0.02 ? 'X-Factor' : r < 0.08 ? 'Superstar' : r < 0.40 ? 'Star' : 'Normal';
    if (ovr >= 74) return r < 0.01 ? 'X-Factor' : r < 0.05 ? 'Superstar' : r < 0.25 ? 'Star' : 'Normal';
    if (ovr >= 70) return r < 0.005 ? 'Superstar' : r < 0.12 ? 'Star' : 'Normal';
    return r < 0.05 ? 'Star' : 'Normal';
  };

  const prospects: any[] = [];
  for (let i = 0; i < 280; i++) {
    let ovr: number;
    if (i < 10)       ovr = Math.floor(Math.random() * 7) + 76;
    else if (i < 32)  ovr = Math.floor(Math.random() * 7) + 71;
    else if (i < 64)  ovr = Math.floor(Math.random() * 6) + 67;
    else if (i < 96)  ovr = Math.floor(Math.random() * 6) + 64;
    else if (i < 128) ovr = Math.floor(Math.random() * 5) + 61;
    else if (i < 160) ovr = Math.floor(Math.random() * 5) + 59;
    else if (i < 224) ovr = Math.floor(Math.random() * 5) + 57;
    else              ovr = Math.floor(Math.random() * 6) + 52;

    prospects.push({
      season,
      first_name: FIRST[Math.floor(Math.random() * FIRST.length)],
      last_name:  LAST[Math.floor(Math.random() * LAST.length)],
      position:   POS_POOL[Math.floor(Math.random() * POS_POOL.length)],
      overall_rating: ovr,
      dev_trait: getDevTrait(ovr),
      age: Math.random() < 0.6 ? 21 : Math.random() < 0.6 ? 22 : 23,
    });
  }

  const ins = db.prepare(`INSERT INTO draft_prospects (season,first_name,last_name,position,overall_rating,dev_trait,age) VALUES (@season,@first_name,@last_name,@position,@overall_rating,@dev_trait,@age)`);
  const run = db.transaction(() => { for (const p of prospects) ins.run(p); });
  run();
  return { generated: prospects.length };
});

ipcMain.handle('get-draft-class', () => {
  const season = getCurrentSeason();
  return db.prepare('SELECT * FROM draft_prospects WHERE season = ? ORDER BY overall_rating DESC').all(season);
});

ipcMain.handle('get-draft-order', () => {
  const season = getCurrentSeason();
  return db.prepare(`
    SELECT t.id, t.city, t.name, t.abbreviation,
      COALESCE((
        SELECT COUNT(*) FROM games g
        WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
          AND ((g.home_team_id = t.id AND g.home_score > g.away_score)
            OR (g.away_team_id = t.id AND g.away_score > g.home_score))
      ), 0) as wins
    FROM teams t ORDER BY wins ASC
  `).all(season);
});

ipcMain.handle('make-draft-pick', (_event: any, { prospectId, teamId, round, pick }: {
  prospectId: number; teamId: number; round: number; pick: number;
}) => {
  const prospect = db.prepare('SELECT * FROM draft_prospects WHERE id = ?').get(prospectId) as any;
  if (!prospect || prospect.is_drafted) return { success: false, reason: 'Not available.' };

  db.prepare('UPDATE draft_prospects SET is_drafted=1, draft_round=?, draft_pick=?, drafted_by_team_id=? WHERE id=?')
    .run(round, pick, teamId, prospectId);

  const rookie = db.prepare(`
    INSERT INTO players (first_name,last_name,position,age,overall_rating,speed,strength,awareness,team_id,is_free_agent,dev_trait,roster_status)
    VALUES (?,?,?,?,?,?,?,?,?,0,?,'active')
  `).run(
    prospect.first_name, prospect.last_name, prospect.position, prospect.age, prospect.overall_rating,
    Math.floor(60 + Math.random() * 30), Math.floor(50 + Math.random() * 30), Math.floor(40 + Math.random() * 30),
    teamId, prospect.dev_trait
  ) as any;

  const sal = Math.round((0.9 + (prospect.overall_rating - 60) * 0.05) * 10) / 10;
  db.prepare(`INSERT INTO contracts (player_id,team_id,years_total,years_remaining,annual_salary,guaranteed_amount,guaranteed_pct) VALUES (?,?,4,4,?,?,50)`)
    .run(rookie.lastInsertRowid, teamId, sal, sal * 4 * 0.5);

  return { success: true };
});

ipcMain.handle('run-cpu-round', (_event: any, { round, userTeamId }: { round: number; userTeamId: number }) => {
  const season = getCurrentSeason();
  const teams = db.prepare(`
    SELECT t.id,
      COALESCE((SELECT COUNT(*) FROM games g WHERE g.season=? AND g.is_simulated=1 AND g.is_playoff=0
        AND ((g.home_team_id=t.id AND g.home_score>g.away_score) OR (g.away_team_id=t.id AND g.away_score>g.home_score))),0) as wins
    FROM teams t ORDER BY wins ASC
  `).all(season) as any[];

  const results: any[] = [];
  const THRESHOLDS: Record<string, number> = { QB:2, RB:3, WR:5, TE:2, OL:5, DL:4, LB:4, CB:4, S:2, K:1 };

  const runPicks = db.transaction(() => {
    let pickNum = 1;
    for (const team of teams) {
      if (team.id === userTeamId) { pickNum++; continue; }

      const counts = db.prepare(`SELECT position, COUNT(*) as cnt FROM players WHERE team_id=? GROUP BY position`).all(team.id) as any[];
      const byPos: Record<string, number> = {};
      for (const r of counts) byPos[r.position] = r.cnt;

      const needs = Object.keys(THRESHOLDS).filter(pos => (byPos[pos] ?? 0) < THRESHOLDS[pos]);

      let prospect: any = null;
      if (needs.length > 0) {
        const ph = needs.map(() => '?').join(',');
        prospect = db.prepare(`SELECT * FROM draft_prospects WHERE season=? AND is_drafted=0 AND position IN (${ph}) ORDER BY overall_rating DESC LIMIT 1`).get(season, ...needs);
      }
      if (!prospect) {
        prospect = db.prepare('SELECT * FROM draft_prospects WHERE season=? AND is_drafted=0 ORDER BY overall_rating DESC LIMIT 1').get(season);
      }
      if (!prospect) { pickNum++; continue; }

      const overallPick = (round - 1) * 32 + pickNum;
      db.prepare('UPDATE draft_prospects SET is_drafted=1, draft_round=?, draft_pick=?, drafted_by_team_id=? WHERE id=?')
        .run(round, overallPick, team.id, prospect.id);

      const r = db.prepare(`INSERT INTO players (first_name,last_name,position,age,overall_rating,speed,strength,awareness,team_id,is_free_agent,dev_trait,roster_status) VALUES (?,?,?,?,?,?,?,?,?,0,?,'active')`).run(
        prospect.first_name, prospect.last_name, prospect.position, prospect.age, prospect.overall_rating,
        Math.floor(60 + Math.random() * 30), Math.floor(50 + Math.random() * 30), Math.floor(40 + Math.random() * 30),
        team.id, prospect.dev_trait
      ) as any;
      const sal = Math.round((0.9 + (prospect.overall_rating - 60) * 0.05) * 10) / 10;
      db.prepare(`INSERT INTO contracts (player_id,team_id,years_total,years_remaining,annual_salary,guaranteed_amount,guaranteed_pct) VALUES (?,?,4,4,?,?,50)`).run(r.lastInsertRowid, team.id, sal, sal * 4 * 0.5);

      results.push({ round, pickInRound: pickNum, teamId: team.id, prospect });
      pickNum++;
    }
  });
  runPicks();
  return results;
});

ipcMain.handle('complete-draft', () => {
  const season = getCurrentSeason();
  const undrafted = db.prepare('SELECT * FROM draft_prospects WHERE season=? AND is_drafted=0').all(season) as any[];
  const run = db.transaction(() => {
    for (const p of undrafted) {
      db.prepare(`INSERT INTO players (first_name,last_name,position,age,overall_rating,speed,strength,awareness,team_id,is_free_agent,dev_trait,roster_status) VALUES (?,?,?,?,?,?,?,?,NULL,1,?,'free_agent')`).run(
        p.first_name, p.last_name, p.position, p.age, p.overall_rating,
        Math.floor(60 + Math.random() * 30), Math.floor(50 + Math.random() * 30), Math.floor(40 + Math.random() * 30),
        p.dev_trait
      );
      db.prepare('UPDATE draft_prospects SET is_drafted=1 WHERE id=?').run(p.id);
    }
  });
  run();
  return { undrafted: undrafted.length };
});

ipcMain.handle('import-otc-contracts', (_event: any, filePath?: string) => {
  const fs = require('fs');
  const pathModule = require('path');

  let otcPath = filePath;
  if (!otcPath) {
    const candidates = ['otc-contracts.html', 'otc-contracts.htm', 'otc-contracts.md', 'Contracts_Over_the_Cap.htm', 'Contracts_Over_the_Cap.html'];
    for (const name of candidates) {
      const p = pathModule.join(process.cwd(), name);
      if (fs.existsSync(p)) { otcPath = p; break; }
    }
  }
  if (!otcPath || !fs.existsSync(otcPath)) {
    return { success: false, reason: 'OTC file not found. Pass the full path or place the file in the project root.' };
  }

  const content: string = fs.readFileSync(otcPath, 'utf8');
  const parseMoney = (s: string): number => parseFloat(s.replace(/[$,]/g, '')) || 0;
  const isHtml = content.trimStart().startsWith('<');

  interface OtcRow { name: string; position: string; aav: number; years: number; guaranteed: number; }
  const rows: OtcRow[] = [];

  if (isHtml) {
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const stripTags = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').trim();
    let rowMatch: RegExpExecArray | null;
    while ((rowMatch = rowRe.exec(content)) !== null) {
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;
      const cellReCopy = new RegExp(cellRe.source, 'gi');
      while ((cellMatch = cellReCopy.exec(rowMatch[1])) !== null) {
        cells.push(stripTags(cellMatch[1]));
      }
      if (cells.length >= 5) {
        const aav = parseMoney(cells[3]);
        const years = parseInt(cells[2]) || 0;
        const gtd = parseMoney(cells[4]);
        if (aav > 0 && years > 0) {
          rows.push({ name: cells[0], position: cells[1] ?? '', aav, years, guaranteed: gtd });
        }
      }
    }
  } else {
    for (const line of content.split('\n')) {
      const parts = line.split(',');
      if (parts.length >= 4) {
        const aav = parseMoney(parts[3]);
        const years = parseInt(parts[2]) || 0;
        if (aav > 0 && years > 0) {
          rows.push({ name: parts[0].trim(), position: parts[1]?.trim() ?? '', aav, years, guaranteed: parseMoney(parts[4] ?? '0') });
        }
      }
    }
  }

  let matched = 0;
  // Strip name suffixes before comparing so "Patrick Mahomes II" matches "Patrick Mahomes"
  const normalize = (s: string) => s.toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')
    .replace(/[^a-z]/g, '');

  const updateContract = db.transaction(() => {
    for (const row of rows) {
      const nameParts = row.name.trim().split(/\s+/);
      if (nameParts.length < 2) continue;
      const first = normalize(nameParts[0]);
      const last  = normalize(nameParts[nameParts.length - 1]);

      const players = db.prepare(`
        SELECT p.id, p.first_name, p.last_name FROM players p
        JOIN contracts c ON c.player_id = p.id
        WHERE p.is_free_agent = 0 AND p.roster_status = 'active'
      `).all() as any[];

      // Try exact first+last match first, then fall back to last name + first initial
      let player = players.find((p: any) =>
        normalize(p.first_name) === first && normalize(p.last_name) === last
      );
      if (!player) {
        const firstInitial = first.charAt(0);
        player = players.find((p: any) =>
          normalize(p.last_name) === last &&
          normalize(p.first_name).charAt(0) === firstInitial
        );
      }
      if (!player) continue;

      const gtdPct = row.guaranteed > 0 && row.aav > 0
        ? Math.min(100, Math.round((row.guaranteed / (row.aav * row.years)) * 100))
        : 30;

      db.prepare(`
        UPDATE contracts SET annual_salary = ?, years_remaining = ?, years_total = ?,
          guaranteed_amount = ?, guaranteed_pct = ?
        WHERE player_id = ?
      `).run(row.aav, row.years, row.years, row.guaranteed || Math.round(row.aav * row.years * 0.3 * 10) / 10, gtdPct, player.id);
      matched++;
    }
  });
  updateContract();

  return { success: true, total: rows.length, matched };
});

// ─── Depth Chart ──────────────────────────────────────────────────────────────

ipcMain.handle('get-depth-chart', (_event: any, teamId: number) => {
  initDepthChart(teamId);
  return db.prepare(`
    SELECT dc.position_group, dc.slot, p.id, p.first_name, p.last_name,
           p.position, p.position_label, p.overall_rating, p.age, p.dev_trait,
           p.injury_status, p.weeks_out
    FROM depth_chart dc
    JOIN players p ON dc.player_id = p.id
    WHERE dc.team_id = ?
    ORDER BY dc.position_group, dc.slot
  `).all(teamId);
});

ipcMain.handle('set-depth-chart-order', (_event: any, { teamId, positionGroup, playerIds }: {
  teamId: number; positionGroup: string; playerIds: number[];
}) => {
  const update = db.prepare('UPDATE depth_chart SET slot = ? WHERE team_id = ? AND player_id = ? AND position_group = ?');
  const run = db.transaction(() => {
    playerIds.forEach((pid, idx) => update.run(idx + 1, teamId, pid, positionGroup));
  });
  run();
  return { success: true };
});

ipcMain.handle('reset-depth-chart', (_event: any, teamId: number) => {
  db.prepare('DELETE FROM depth_chart WHERE team_id = ?').run(teamId);
  initDepthChart(teamId);
  return { success: true };
});

// ─── Historical Records ────────────────────────────────────────────────────────

ipcMain.handle('get-alltime-leaders', () => {
  const baseSelect = `
    p.id as player_id,
    p.first_name || ' ' || p.last_name AS player_name,
    p.position, p.age, p.overall_rating, p.dev_trait,
    COALESCE(t.city || ' ' || t.name, 'Retired') AS team_name
  `;

  const passing = db.prepare(`
    SELECT ${baseSelect},
      SUM(COALESCE(csh.games,0) + COALESCE(live.games,0)) AS games_played,
      SUM(COALESCE(csh.pass_yards,0) + COALESCE(live.pass_yards,0)) AS pass_yards,
      SUM(COALESCE(csh.pass_tds,0) + COALESCE(live.pass_tds,0)) AS pass_tds,
      SUM(COALESCE(csh.interceptions,0) + COALESCE(live.interceptions,0)) AS interceptions,
      SUM(COALESCE(csh.completions,0) + COALESCE(live.completions,0)) AS completions,
      SUM(COALESCE(csh.pass_attempts,0) + COALESCE(live.pass_attempts,0)) AS pass_attempts,
      0 AS rush_yards, 0 AS rush_tds, 0 AS rush_attempts,
      0 AS rec_yards, 0 AS rec_tds, 0 AS receptions, 0 AS targets,
      0 AS tackles, 0 AS assisted_tackles, 0 AS sacks, 0 AS tfl,
      0 AS def_interceptions, 0 AS pass_deflections, 0 AS forced_fumbles
    FROM players p
    LEFT JOIN teams t ON p.team_id = t.id
    LEFT JOIN (
      SELECT player_id,
        SUM(games) as games, SUM(pass_yards) as pass_yards, SUM(pass_tds) as pass_tds,
        SUM(interceptions) as interceptions, SUM(completions) as completions, SUM(pass_attempts) as pass_attempts
      FROM career_stats_history GROUP BY player_id
    ) csh ON csh.player_id = p.id
    LEFT JOIN (
      SELECT s.player_id,
        COUNT(DISTINCT s.game_id) as games, SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds,
        SUM(s.interceptions) as interceptions, SUM(s.completions) as completions, SUM(s.pass_attempts) as pass_attempts
      FROM stats s JOIN games g ON s.game_id = g.id WHERE g.is_simulated = 1 GROUP BY s.player_id
    ) live ON live.player_id = p.id
    WHERE (COALESCE(csh.pass_yards,0) + COALESCE(live.pass_yards,0)) > 0
    GROUP BY p.id
    ORDER BY pass_yards DESC LIMIT 25
  `).all();

  const rushing = db.prepare(`
    SELECT ${baseSelect},
      SUM(COALESCE(csh.games,0) + COALESCE(live.games,0)) AS games_played,
      SUM(COALESCE(csh.rush_yards,0) + COALESCE(live.rush_yards,0)) AS rush_yards,
      SUM(COALESCE(csh.rush_tds,0) + COALESCE(live.rush_tds,0)) AS rush_tds,
      SUM(COALESCE(csh.rush_attempts,0) + COALESCE(live.rush_attempts,0)) AS rush_attempts,
      0 AS pass_yards, 0 AS pass_tds, 0 AS interceptions, 0 AS completions, 0 AS pass_attempts,
      0 AS rec_yards, 0 AS rec_tds, 0 AS receptions, 0 AS targets,
      0 AS tackles, 0 AS assisted_tackles, 0 AS sacks, 0 AS tfl,
      0 AS def_interceptions, 0 AS pass_deflections, 0 AS forced_fumbles
    FROM players p
    LEFT JOIN teams t ON p.team_id = t.id
    LEFT JOIN (
      SELECT player_id, SUM(games) as games, SUM(rush_yards) as rush_yards, SUM(rush_tds) as rush_tds, SUM(rush_attempts) as rush_attempts
      FROM career_stats_history GROUP BY player_id
    ) csh ON csh.player_id = p.id
    LEFT JOIN (
      SELECT s.player_id, COUNT(DISTINCT s.game_id) as games, SUM(s.rush_yards) as rush_yards, SUM(s.rush_tds) as rush_tds, SUM(s.rush_attempts) as rush_attempts
      FROM stats s JOIN games g ON s.game_id = g.id WHERE g.is_simulated = 1 GROUP BY s.player_id
    ) live ON live.player_id = p.id
    WHERE (COALESCE(csh.rush_yards,0) + COALESCE(live.rush_yards,0)) > 0
    GROUP BY p.id
    ORDER BY rush_yards DESC LIMIT 25
  `).all();

  const receiving = db.prepare(`
    SELECT ${baseSelect},
      SUM(COALESCE(csh.games,0) + COALESCE(live.games,0)) AS games_played,
      SUM(COALESCE(csh.rec_yards,0) + COALESCE(live.rec_yards,0)) AS rec_yards,
      SUM(COALESCE(csh.rec_tds,0) + COALESCE(live.rec_tds,0)) AS rec_tds,
      SUM(COALESCE(csh.receptions,0) + COALESCE(live.receptions,0)) AS receptions,
      SUM(COALESCE(csh.targets,0) + COALESCE(live.targets,0)) AS targets,
      0 AS pass_yards, 0 AS pass_tds, 0 AS interceptions, 0 AS completions, 0 AS pass_attempts,
      0 AS rush_yards, 0 AS rush_tds, 0 AS rush_attempts,
      0 AS tackles, 0 AS assisted_tackles, 0 AS sacks, 0 AS tfl,
      0 AS def_interceptions, 0 AS pass_deflections, 0 AS forced_fumbles
    FROM players p
    LEFT JOIN teams t ON p.team_id = t.id
    LEFT JOIN (
      SELECT player_id, SUM(games) as games, SUM(rec_yards) as rec_yards, SUM(rec_tds) as rec_tds, SUM(receptions) as receptions, SUM(targets) as targets
      FROM career_stats_history GROUP BY player_id
    ) csh ON csh.player_id = p.id
    LEFT JOIN (
      SELECT s.player_id, COUNT(DISTINCT s.game_id) as games, SUM(s.rec_yards) as rec_yards, SUM(s.rec_tds) as rec_tds, SUM(s.receptions) as receptions, SUM(s.targets) as targets
      FROM stats s JOIN games g ON s.game_id = g.id WHERE g.is_simulated = 1 GROUP BY s.player_id
    ) live ON live.player_id = p.id
    WHERE (COALESCE(csh.rec_yards,0) + COALESCE(live.rec_yards,0)) > 0
    GROUP BY p.id
    ORDER BY rec_yards DESC LIMIT 25
  `).all();

  const tds = db.prepare(`
    SELECT ${baseSelect},
      SUM(COALESCE(csh.games,0) + COALESCE(live.games,0)) AS games_played,
      SUM(COALESCE(csh.pass_tds,0) + COALESCE(live.pass_tds,0)) AS pass_tds,
      SUM(COALESCE(csh.rush_tds,0) + COALESCE(live.rush_tds,0)) AS rush_tds,
      SUM(COALESCE(csh.rec_tds,0) + COALESCE(live.rec_tds,0)) AS rec_tds,
      0 AS pass_yards, 0 AS interceptions, 0 AS completions, 0 AS pass_attempts,
      0 AS rush_yards, 0 AS rush_attempts,
      0 AS rec_yards, 0 AS receptions, 0 AS targets,
      0 AS tackles, 0 AS assisted_tackles, 0 AS sacks, 0 AS tfl,
      0 AS def_interceptions, 0 AS pass_deflections, 0 AS forced_fumbles
    FROM players p
    LEFT JOIN teams t ON p.team_id = t.id
    LEFT JOIN (
      SELECT player_id, SUM(games) as games, SUM(pass_tds) as pass_tds, SUM(rush_tds) as rush_tds, SUM(rec_tds) as rec_tds
      FROM career_stats_history GROUP BY player_id
    ) csh ON csh.player_id = p.id
    LEFT JOIN (
      SELECT s.player_id, COUNT(DISTINCT s.game_id) as games, SUM(s.pass_tds) as pass_tds, SUM(s.rush_tds) as rush_tds, SUM(s.rec_tds) as rec_tds
      FROM stats s JOIN games g ON s.game_id = g.id WHERE g.is_simulated = 1 GROUP BY s.player_id
    ) live ON live.player_id = p.id
    WHERE (COALESCE(csh.pass_tds,0)+COALESCE(live.pass_tds,0)+COALESCE(csh.rush_tds,0)+COALESCE(live.rush_tds,0)+COALESCE(csh.rec_tds,0)+COALESCE(live.rec_tds,0)) > 0
    GROUP BY p.id
    ORDER BY (
      SUM(COALESCE(csh.pass_tds,0)+COALESCE(live.pass_tds,0)) +
      SUM(COALESCE(csh.rush_tds,0)+COALESCE(live.rush_tds,0)) +
      SUM(COALESCE(csh.rec_tds,0)+COALESCE(live.rec_tds,0))
    ) DESC LIMIT 25
  `).all();

  const tackles = db.prepare(`
    SELECT ${baseSelect},
      SUM(COALESCE(csh.games,0) + COALESCE(live.games,0)) AS games_played,
      SUM(COALESCE(csh.tackles,0) + COALESCE(live.tackles,0)) AS tackles,
      SUM(COALESCE(csh.assisted_tackles,0) + COALESCE(live.assisted_tackles,0)) AS assisted_tackles,
      SUM(COALESCE(csh.sacks,0) + COALESCE(live.sacks,0)) AS sacks,
      SUM(COALESCE(csh.tfl,0) + COALESCE(live.tfl,0)) AS tfl,
      0 AS pass_yards, 0 AS pass_tds, 0 AS interceptions, 0 AS completions, 0 AS pass_attempts,
      0 AS rush_yards, 0 AS rush_tds, 0 AS rush_attempts,
      0 AS rec_yards, 0 AS rec_tds, 0 AS receptions, 0 AS targets,
      0 AS def_interceptions, 0 AS pass_deflections, 0 AS forced_fumbles
    FROM players p
    LEFT JOIN teams t ON p.team_id = t.id
    LEFT JOIN (
      SELECT player_id, SUM(games) as games, SUM(tackles) as tackles, SUM(assisted_tackles) as assisted_tackles, SUM(sacks) as sacks, SUM(tfl) as tfl
      FROM career_stats_history GROUP BY player_id
    ) csh ON csh.player_id = p.id
    LEFT JOIN (
      SELECT s.player_id, COUNT(DISTINCT s.game_id) as games, SUM(s.tackles) as tackles, SUM(s.assisted_tackles) as assisted_tackles, SUM(s.sacks) as sacks, SUM(s.tfl) as tfl
      FROM stats s JOIN games g ON s.game_id = g.id WHERE g.is_simulated = 1 GROUP BY s.player_id
    ) live ON live.player_id = p.id
    WHERE (COALESCE(csh.tackles,0) + COALESCE(live.tackles,0)) > 0
    GROUP BY p.id
    ORDER BY tackles DESC LIMIT 25
  `).all();

  const sacks = db.prepare(`
    SELECT ${baseSelect},
      SUM(COALESCE(csh.games,0) + COALESCE(live.games,0)) AS games_played,
      SUM(COALESCE(csh.sacks,0) + COALESCE(live.sacks,0)) AS sacks,
      SUM(COALESCE(csh.tfl,0) + COALESCE(live.tfl,0)) AS tfl,
      SUM(COALESCE(csh.forced_fumbles,0) + COALESCE(live.forced_fumbles,0)) AS forced_fumbles,
      SUM(COALESCE(csh.tackles,0) + COALESCE(live.tackles,0)) AS tackles,
      0 AS pass_yards, 0 AS pass_tds, 0 AS interceptions, 0 AS completions, 0 AS pass_attempts,
      0 AS rush_yards, 0 AS rush_tds, 0 AS rush_attempts,
      0 AS rec_yards, 0 AS rec_tds, 0 AS receptions, 0 AS targets,
      0 AS assisted_tackles, 0 AS def_interceptions, 0 AS pass_deflections
    FROM players p
    LEFT JOIN teams t ON p.team_id = t.id
    LEFT JOIN (
      SELECT player_id, SUM(games) as games, SUM(sacks) as sacks, SUM(tfl) as tfl, SUM(forced_fumbles) as forced_fumbles, SUM(tackles) as tackles
      FROM career_stats_history GROUP BY player_id
    ) csh ON csh.player_id = p.id
    LEFT JOIN (
      SELECT s.player_id, COUNT(DISTINCT s.game_id) as games, SUM(s.sacks) as sacks, SUM(s.tfl) as tfl, SUM(s.forced_fumbles) as forced_fumbles, SUM(s.tackles) as tackles
      FROM stats s JOIN games g ON s.game_id = g.id WHERE g.is_simulated = 1 GROUP BY s.player_id
    ) live ON live.player_id = p.id
    WHERE (COALESCE(csh.sacks,0) + COALESCE(live.sacks,0)) > 0
    GROUP BY p.id
    ORDER BY sacks DESC LIMIT 25
  `).all();

  const defInts = db.prepare(`
    SELECT ${baseSelect},
      SUM(COALESCE(csh.games,0) + COALESCE(live.games,0)) AS games_played,
      SUM(COALESCE(csh.def_interceptions,0) + COALESCE(live.def_interceptions,0)) AS def_interceptions,
      SUM(COALESCE(csh.pass_deflections,0) + COALESCE(live.pass_deflections,0)) AS pass_deflections,
      SUM(COALESCE(csh.tackles,0) + COALESCE(live.tackles,0)) AS tackles,
      0 AS pass_yards, 0 AS pass_tds, 0 AS interceptions, 0 AS completions, 0 AS pass_attempts,
      0 AS rush_yards, 0 AS rush_tds, 0 AS rush_attempts,
      0 AS rec_yards, 0 AS rec_tds, 0 AS receptions, 0 AS targets,
      0 AS assisted_tackles, 0 AS sacks, 0 AS tfl, 0 AS forced_fumbles
    FROM players p
    LEFT JOIN teams t ON p.team_id = t.id
    LEFT JOIN (
      SELECT player_id, SUM(games) as games, SUM(def_interceptions) as def_interceptions, SUM(pass_deflections) as pass_deflections, SUM(tackles) as tackles
      FROM career_stats_history GROUP BY player_id
    ) csh ON csh.player_id = p.id
    LEFT JOIN (
      SELECT s.player_id, COUNT(DISTINCT s.game_id) as games, SUM(s.def_interceptions) as def_interceptions, SUM(s.pass_deflections) as pass_deflections, SUM(s.tackles) as tackles
      FROM stats s JOIN games g ON s.game_id = g.id WHERE g.is_simulated = 1 GROUP BY s.player_id
    ) live ON live.player_id = p.id
    WHERE (COALESCE(csh.def_interceptions,0) + COALESCE(live.def_interceptions,0)) > 0
    GROUP BY p.id
    ORDER BY def_interceptions DESC LIMIT 25
  `).all();

  return { passing, rushing, receiving, tds, tackles, sacks, defInts };
});

ipcMain.handle('get-season-records', () => {
  const baseSelect = `
    p.id as player_id,
    p.first_name || ' ' || p.last_name AS player_name,
    p.position, p.age, p.overall_rating, p.dev_trait,
    COALESCE(t.city || ' ' || t.name, 'Retired') AS team_name
  `;

  const passing = db.prepare(`
    SELECT ${baseSelect}, csh.season,
      csh.games AS games_played,
      csh.pass_yards, csh.pass_tds, csh.interceptions, csh.completions, csh.pass_attempts,
      0 AS rush_yards, 0 AS rush_tds, 0 AS rush_attempts,
      0 AS rec_yards, 0 AS rec_tds, 0 AS receptions, 0 AS targets,
      0 AS tackles, 0 AS assisted_tackles, 0 AS sacks, 0 AS tfl,
      0 AS def_interceptions, 0 AS pass_deflections, 0 AS forced_fumbles
    FROM career_stats_history csh
    JOIN players p ON csh.player_id = p.id
    LEFT JOIN teams t ON p.team_id = t.id
    WHERE csh.pass_yards > 0
    ORDER BY csh.pass_yards DESC LIMIT 25
  `).all();

  const rushing = db.prepare(`
    SELECT ${baseSelect}, csh.season,
      csh.games AS games_played,
      csh.rush_yards, csh.rush_tds, csh.rush_attempts,
      0 AS pass_yards, 0 AS pass_tds, 0 AS interceptions, 0 AS completions, 0 AS pass_attempts,
      0 AS rec_yards, 0 AS rec_tds, 0 AS receptions, 0 AS targets,
      0 AS tackles, 0 AS assisted_tackles, 0 AS sacks, 0 AS tfl,
      0 AS def_interceptions, 0 AS pass_deflections, 0 AS forced_fumbles
    FROM career_stats_history csh
    JOIN players p ON csh.player_id = p.id
    LEFT JOIN teams t ON p.team_id = t.id
    WHERE csh.rush_yards > 0
    ORDER BY csh.rush_yards DESC LIMIT 25
  `).all();

  const receiving = db.prepare(`
    SELECT ${baseSelect}, csh.season,
      csh.games AS games_played,
      csh.rec_yards, csh.rec_tds, csh.receptions, csh.targets,
      0 AS pass_yards, 0 AS pass_tds, 0 AS interceptions, 0 AS completions, 0 AS pass_attempts,
      0 AS rush_yards, 0 AS rush_tds, 0 AS rush_attempts,
      0 AS tackles, 0 AS assisted_tackles, 0 AS sacks, 0 AS tfl,
      0 AS def_interceptions, 0 AS pass_deflections, 0 AS forced_fumbles
    FROM career_stats_history csh
    JOIN players p ON csh.player_id = p.id
    LEFT JOIN teams t ON p.team_id = t.id
    WHERE csh.rec_yards > 0
    ORDER BY csh.rec_yards DESC LIMIT 25
  `).all();

  const tds = db.prepare(`
    SELECT ${baseSelect}, csh.season,
      csh.games AS games_played,
      csh.pass_tds, csh.rush_tds, csh.rec_tds,
      (csh.pass_tds + csh.rush_tds + csh.rec_tds) AS total_tds,
      0 AS pass_yards, 0 AS interceptions, 0 AS completions, 0 AS pass_attempts,
      0 AS rush_yards, 0 AS rush_attempts,
      0 AS rec_yards, 0 AS receptions, 0 AS targets,
      0 AS tackles, 0 AS assisted_tackles, 0 AS sacks, 0 AS tfl,
      0 AS def_interceptions, 0 AS pass_deflections, 0 AS forced_fumbles
    FROM career_stats_history csh
    JOIN players p ON csh.player_id = p.id
    LEFT JOIN teams t ON p.team_id = t.id
    WHERE (csh.pass_tds + csh.rush_tds + csh.rec_tds) > 0
    ORDER BY total_tds DESC LIMIT 25
  `).all();

  const tackles = db.prepare(`
    SELECT ${baseSelect}, csh.season,
      csh.games AS games_played,
      csh.tackles, csh.assisted_tackles, csh.sacks, csh.tfl,
      0 AS pass_yards, 0 AS pass_tds, 0 AS interceptions, 0 AS completions, 0 AS pass_attempts,
      0 AS rush_yards, 0 AS rush_tds, 0 AS rush_attempts,
      0 AS rec_yards, 0 AS rec_tds, 0 AS receptions, 0 AS targets,
      0 AS def_interceptions, 0 AS pass_deflections, 0 AS forced_fumbles
    FROM career_stats_history csh
    JOIN players p ON csh.player_id = p.id
    LEFT JOIN teams t ON p.team_id = t.id
    WHERE csh.tackles > 0
    ORDER BY csh.tackles DESC LIMIT 25
  `).all();

  const sacks = db.prepare(`
    SELECT ${baseSelect}, csh.season,
      csh.games AS games_played,
      csh.sacks, csh.tfl, csh.forced_fumbles, csh.tackles,
      0 AS pass_yards, 0 AS pass_tds, 0 AS interceptions, 0 AS completions, 0 AS pass_attempts,
      0 AS rush_yards, 0 AS rush_tds, 0 AS rush_attempts,
      0 AS rec_yards, 0 AS rec_tds, 0 AS receptions, 0 AS targets,
      0 AS assisted_tackles, 0 AS def_interceptions, 0 AS pass_deflections
    FROM career_stats_history csh
    JOIN players p ON csh.player_id = p.id
    LEFT JOIN teams t ON p.team_id = t.id
    WHERE csh.sacks > 0
    ORDER BY csh.sacks DESC LIMIT 25
  `).all();

  const defInts = db.prepare(`
    SELECT ${baseSelect}, csh.season,
      csh.games AS games_played,
      csh.def_interceptions, csh.pass_deflections, csh.tackles,
      0 AS pass_yards, 0 AS pass_tds, 0 AS interceptions, 0 AS completions, 0 AS pass_attempts,
      0 AS rush_yards, 0 AS rush_tds, 0 AS rush_attempts,
      0 AS rec_yards, 0 AS rec_tds, 0 AS receptions, 0 AS targets,
      0 AS assisted_tackles, 0 AS sacks, 0 AS tfl, 0 AS forced_fumbles
    FROM career_stats_history csh
    JOIN players p ON csh.player_id = p.id
    LEFT JOIN teams t ON p.team_id = t.id
    WHERE csh.def_interceptions > 0
    ORDER BY csh.def_interceptions DESC LIMIT 25
  `).all();

  return { passing, rushing, receiving, tds, tackles, sacks, defInts };
});

// ─── NFLverse Stats Import (stub) ─────────────────────────────────────────────
// Keeps the preload bridge working — full implementation can be added later.
ipcMain.handle('import-nflverse-stats', () => {
  return { success: false, reason: 'NFLverse import not configured. Use OTC import instead.' };
});

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.on('ready', createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });