import { app, BrowserWindow, ipcMain } from 'electron';
const { db, generateContracts } = require('./database');
const { simulateGame } = require('./simulateGame');

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

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
      SUM(s.targets) as targets, SUM(s.receptions) as receptions, SUM(s.rec_yards) as rec_yards, SUM(s.rec_tds) as rec_tds
    FROM stats s JOIN games g ON s.game_id = g.id WHERE s.player_id = ? AND g.season = ?
  `).get(playerId, season);
});

ipcMain.handle('get-player-career-stats', (_event: any, playerId: number) => {
  return db.prepare(`
    SELECT g.season, COUNT(DISTINCT s.game_id) as games,
      SUM(s.pass_attempts) as pass_attempts, SUM(s.completions) as completions,
      SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds, SUM(s.interceptions) as interceptions,
      SUM(s.rush_attempts) as rush_attempts, SUM(s.rush_yards) as rush_yards, SUM(s.rush_tds) as rush_tds,
      SUM(s.targets) as targets, SUM(s.receptions) as receptions, SUM(s.rec_yards) as rec_yards, SUM(s.rec_tds) as rec_tds
    FROM stats s JOIN games g ON s.game_id = g.id WHERE s.player_id = ?
    GROUP BY g.season ORDER BY g.season DESC
  `).all(playerId);
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
    SELECT p.first_name || ' ' || p.last_name AS player_name, t.city || ' ' || t.name AS team_name,
      SUM(st.pass_yards) AS pass_yards, SUM(st.pass_tds) AS pass_tds,
      SUM(st.interceptions) AS interceptions, SUM(st.completions) AS completions, SUM(st.pass_attempts) AS pass_attempts
    FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.pass_attempts > 0 GROUP BY p.id ORDER BY pass_yards DESC LIMIT 15
  `).all(s);
  const rushing = db.prepare(`
    SELECT p.first_name || ' ' || p.last_name AS player_name, t.city || ' ' || t.name AS team_name,
      SUM(st.rush_yards) AS rush_yards, SUM(st.rush_tds) AS rush_tds, SUM(st.rush_attempts) AS rush_attempts
    FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.rush_attempts > 0 GROUP BY p.id ORDER BY rush_yards DESC LIMIT 15
  `).all(s);
  const receiving = db.prepare(`
    SELECT p.first_name || ' ' || p.last_name AS player_name, t.city || ' ' || t.name AS team_name,
      SUM(st.rec_yards) AS rec_yards, SUM(st.rec_tds) AS rec_tds, SUM(st.receptions) AS receptions, SUM(st.targets) AS targets
    FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.targets > 0 GROUP BY p.id ORDER BY rec_yards DESC LIMIT 15
  `).all(s);
  return { passing, rushing, receiving };
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

  const afcWC  = [simGame(afcTeams[1], afcTeams[6], 18), simGame(afcTeams[2], afcTeams[5], 18), simGame(afcTeams[3], afcTeams[4], 18)];
  const nfcWC  = [simGame(nfcTeams[1], nfcTeams[6], 18), simGame(nfcTeams[2], nfcTeams[5], 18), simGame(nfcTeams[3], nfcTeams[4], 18)];
  const afcDiv = [simGame(afcTeams[0], afcWC[2].winner, 19), simGame(afcWC[0].winner, afcWC[1].winner, 19)];
  const nfcDiv = [simGame(nfcTeams[0], nfcWC[2].winner, 19), simGame(nfcWC[0].winner, nfcWC[1].winner, 19)];
  const afcChamp  = simGame(afcDiv[0].winner, afcDiv[1].winner, 20);
  const nfcChamp  = simGame(nfcDiv[0].winner, nfcDiv[1].winner, 20);
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

  db.prepare('UPDATE players SET age = age + 1 WHERE is_free_agent = 0').run();

  const players = db.prepare(
    'SELECT id, age, overall_rating, dev_trait FROM players WHERE is_free_agent = 0 AND team_id IS NOT NULL'
  ).all() as any[];

  const updateOvr = db.prepare('UPDATE players SET overall_rating = ? WHERE id = ?');
  const progressionTable: Record<string, Record<string, [number, number]>> = {
    young:   { Normal: [0, 1],  Star: [1, 2],  Superstar: [2, 3],  'X-Factor': [3, 4]  },
    rising:  { Normal: [0, 1],  Star: [0, 2],  Superstar: [1, 2],  'X-Factor': [2, 3]  },
    prime:   { Normal: [-1, 0], Star: [0, 1],  Superstar: [0, 1],  'X-Factor': [0, 1]  },
    decline: { Normal: [-2,-1], Star: [-1, 0], Superstar: [-1, 0], 'X-Factor': [-1, 0] },
    old:     { Normal: [-3,-2], Star: [-2,-1], Superstar: [-2,-1], 'X-Factor': [-1, 0] },
    veteran: { Normal: [-4,-3], Star: [-3,-2], Superstar: [-3,-2], 'X-Factor': [-2,-1] },
  };

  const progressPlayers = db.transaction(() => {
    for (const p of players) {
      const trait = p.dev_trait ?? 'Normal';
      const bracket = p.age <= 23 ? 'young' : p.age <= 26 ? 'rising' : p.age <= 29 ? 'prime' : p.age <= 32 ? 'decline' : p.age <= 35 ? 'old' : 'veteran';
      const [min, max] = progressionTable[bracket][trait] ?? [0, 0];
      const change = Math.floor(Math.random() * (max - min + 1)) + min;
      updateOvr.run(Math.max(40, Math.min(99, p.overall_rating + change)), p.id);
    }
  });
  progressPlayers();

  // Dev trait regression — older/declining players can lose their trait
const devDowngrade = db.prepare('UPDATE players SET dev_trait = ? WHERE id = ?');
const allRostered = db.prepare(
  'SELECT id, age, overall_rating, dev_trait FROM players WHERE team_id IS NOT NULL'
).all() as any[];

const regressTraits = db.transaction(() => {
  for (const p of allRostered) {
    const trait = p.dev_trait;
    const rand = Math.random();

    if (trait === 'X-Factor') {
      const shouldDowngrade = p.age >= 32 || p.overall_rating < 88 || rand < 0.04;
      if (shouldDowngrade) devDowngrade.run('Superstar', p.id);

    } else if (trait === 'Superstar') {
      const shouldDowngrade = p.age >= 34 || p.overall_rating < 82 || rand < 0.05;
      if (shouldDowngrade) devDowngrade.run('Star', p.id);

    } else if (trait === 'Star') {
      const shouldDowngrade = p.age >= 36 || p.overall_rating < 76 || rand < 0.06;
      if (shouldDowngrade) devDowngrade.run('Normal', p.id);
    }
  }
});
regressTraits();

  // Decrement contract years, release expired players as free agents
  db.prepare('UPDATE contracts SET years_remaining = years_remaining - 1').run();
  const expiredPlayers = db.prepare('SELECT player_id FROM contracts WHERE years_remaining <= 0').all() as any[];
  const expireContracts = db.transaction(() => {
    for (const { player_id } of expiredPlayers) {
      db.prepare('DELETE FROM contracts WHERE player_id = ?').run(player_id);
      db.prepare('UPDATE players SET team_id = NULL, is_free_agent = 1 WHERE id = ?').run(player_id);
    }
  });
  expireContracts();

  // Retire truly aging low-rated players
  db.prepare(`UPDATE players SET team_id = NULL, is_free_agent = 1 WHERE age >= 38 AND overall_rating < 72 AND is_free_agent = 0`).run();

  db.prepare("UPDATE settings SET value = ? WHERE key = 'current_season'").run(String(next));
  return { nextSeason: next };
});

// ─── Week-by-Week Simulation ──────────────────────────────────────────────────

ipcMain.handle('generate-schedule', () => {
  const season = getCurrentSeason();
  const existing = (db.prepare('SELECT COUNT(*) as count FROM games WHERE season = ? AND is_playoff = 0').get(season) as any).count;
  if (existing > 0) return { alreadyExists: true, season };
  const teams = db.prepare('SELECT id FROM teams').all() as any[];
  const insertGame = db.prepare('INSERT INTO games (season, week, home_team_id, away_team_id, is_simulated) VALUES (?, ?, ?, ?, 0)');
  const create = db.transaction(() => {
    for (let week = 1; week <= 17; week++) {
      const shuffled = [...teams].sort(() => Math.random() - 0.5);
      for (let i = 0; i < shuffled.length; i += 2) {
        insertGame.run(season, week, shuffled[i].id, shuffled[i + 1].id);
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
  const games = db.prepare(`SELECT id, home_team_id, away_team_id FROM games WHERE season = ? AND week = ? AND is_simulated = 0 AND is_playoff = 0`).all(season, week) as any[];
  if (games.length === 0) return { week, season, gamesSimulated: 0 };

  const updateGame = db.prepare('UPDATE games SET home_score = ?, away_score = ?, is_simulated = 1 WHERE id = ?');
  const insertStat = db.prepare(`
    INSERT INTO stats (game_id, player_id, team_id, pass_attempts, completions, pass_yards, pass_tds, interceptions, rush_attempts, rush_yards, rush_tds, targets, receptions, rec_yards, rec_tds)
    VALUES (@game_id, @player_id, @team_id, @pass_attempts, @completions, @pass_yards, @pass_tds, @interceptions, @rush_attempts, @rush_yards, @rush_tds, @targets, @receptions, @rec_yards, @rec_tds)
  `);
  const runWeek = db.transaction(() => {
    for (const game of games) {
      const result = simulateGame(game.home_team_id, game.away_team_id);
      updateGame.run(result.homeScore, result.awayScore, game.id);
      for (const stat of [...result.homePlayerStats, ...result.awayPlayerStats]) {
        insertStat.run({ game_id: game.id, ...stat });
      }
    }
  });
  runWeek();
  return { week, season, gamesSimulated: games.length };
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
  db.prepare('DELETE FROM stats').run();
  db.prepare('DELETE FROM games').run();
  db.prepare('DELETE FROM champions').run();
  db.prepare('DELETE FROM contracts').run();
  db.prepare("UPDATE players SET is_free_agent = 0 WHERE is_free_agent = 1").run();
  db.prepare("UPDATE players SET roster_status = 'active' WHERE roster_status = 'free_agent' AND team_id IS NOT NULL").run();
  db.prepare("UPDATE settings SET value = '2025' WHERE key = 'current_season'").run();
  generateContracts();
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

  const myValue    = myPlayers.reduce((sum: number, p: any) => sum + calcPlayerTradeValue(p.overall_rating, p.age, p.position, p.dev_trait), 0);
  const theirValue = theirPlayers.reduce((sum: number, p: any) => sum + calcPlayerTradeValue(p.overall_rating, p.age, p.position, p.dev_trait), 0);

  const valueDiff    = myValue - theirValue;
  const randomFactor = Math.floor(Math.random() * 11) - 5;
  const profile      = getTeamTradeProfile(theirTeamId);
  const availabilityPremium = theirPlayers.reduce((sum: number, p: any) => sum + getPlayerAvailabilityPremium(p), 0);
  const effectiveThreshold  = profile.acceptanceThreshold + availabilityPremium;
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
    availabilityPremium > 0  ? 'We\'re protective of that player. You\'ll need to significantly sweeten the offer.' :
    valueDiff < -20          ? 'Not enough value — we need significantly more to make this work.' :
    valueDiff < -10          ? 'The offer is too light for us right now.' :
                               'We\'re not interested at this time.';
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
  const SALARY_CAP = 279.2; // 2026 NFL cap (millions)
  const result = db.prepare(`
    SELECT COALESCE(SUM(c.annual_salary), 0) as used_cap
    FROM contracts c
    JOIN players p ON c.player_id = p.id
    WHERE c.team_id = ? AND p.roster_status = 'active'
  `).get(teamId) as any;
  const usedCap = Math.round(result.used_cap * 10) / 10;
  return {
    total_cap:     SALARY_CAP,
    used_cap:      usedCap,
    available_cap: Math.round((SALARY_CAP - usedCap) * 10) / 10,
  };
});

ipcMain.handle('get-roster-spots', (_event: any, teamId: number) => {
  const counts = db.prepare(`
    SELECT roster_status, COUNT(*) as count
    FROM players WHERE team_id = ? GROUP BY roster_status
  `).all(teamId) as any[];
  const active = counts.find((r: any) => r.roster_status === 'active')?.count ?? 0;
  const ps     = counts.find((r: any) => r.roster_status === 'practice_squad')?.count ?? 0;
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
  const guaranteedPct    = Math.round(40 + Math.random() * 20);
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

  // ── Fair market value (mirrors Franchise.tsx fairMarketValue) ──────────────
  const marketRates: Record<string, [number, number][]> = {
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
  const traitMul: Record<string, number> = { Normal: 1.0, Star: 1.1, Superstar: 1.25, 'X-Factor': 1.45 };
  const rates = marketRates[player.position] ?? marketRates['LB'];
  let baseMarket = rates[rates.length - 1][1];
  for (let i = 0; i < rates.length - 1; i++) {
    const [highOvr, highSal] = rates[i];
    const [lowOvr, lowSal]   = rates[i + 1];
    if (player.overall_rating >= lowOvr) {
      const t = (player.overall_rating - lowOvr) / (highOvr - lowOvr);
      baseMarket = lowSal + t * (highSal - lowSal);
      break;
    }
  }
  const fairMarket = Math.round(baseMarket * (traitMul[player.dev_trait] ?? 1.0) * 10) / 10;
  const ratio = salary / Math.max(fairMarket, 1);

  // ── Base acceptance probability ────────────────────────────────────────────
  let acceptChance =
    ratio >= 1.00 ? 1.00 :
    ratio >= 0.85 ? 0.90 :
    ratio >= 0.70 ? 0.60 :
    ratio >= 0.50 ? 0.20 : 0.00;

  // ── Modifiers ──────────────────────────────────────────────────────────────
  // Older players have less leverage — more willing to take a discount
  if (player.age >= 33) acceptChance = Math.min(1, acceptChance + 0.15);
  if (player.age >= 36) acceptChance = Math.min(1, acceptChance + 0.15);

  // Elite traits know their worth — harder to lowball
  if (player.dev_trait === 'X-Factor')  acceptChance = Math.max(0, acceptChance - 0.20);
  if (player.dev_trait === 'Superstar') acceptChance = Math.max(0, acceptChance - 0.10);

  // Contending team is a draw — players take slight discount to chase a ring
  const season = getCurrentSeason();
  const record = db.prepare(`
    SELECT
      SUM(CASE WHEN (home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score) THEN 1 ELSE 0 END) as wins,
      COUNT(*) as played
    FROM games WHERE (home_team_id = ? OR away_team_id = ?) AND season = ? AND is_simulated = 1 AND is_playoff = 0
  `).get(teamId, teamId, teamId, teamId, season) as any;
  const winPct = record?.played >= 4 ? record.wins / record.played : 0.5;
  if (winPct >= 0.65) acceptChance = Math.min(1, acceptChance + 0.08);

  // ── Decision ───────────────────────────────────────────────────────────────
  const accepted = Math.random() < acceptChance;

  if (!accepted) {
    const reason =
      ratio < 0.50 ? `Insulted by the offer. ${player.dev_trait === 'X-Factor' || player.dev_trait === 'Superstar' ? 'Elite players' : 'Players'} don\'t sign for that salary.` :
      ratio < 0.70 ? `Not enough money. Looking for closer to ${fairMarket.toFixed(1)}M/yr on the open market.` :
      ratio < 0.85 ? `Decided to explore other options. Try sweetening the offer slightly.` :
      `Chose to sign elsewhere. Sometimes it just doesn\'t work out.`;
    return { success: false, reason };
  }

  // ── Execute signing ────────────────────────────────────────────────────────
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

  const marketRates: Record<string, [number, number][]> = {
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
  const traitMul: Record<string, number> = { Normal: 1.0, Star: 1.1, Superstar: 1.25, 'X-Factor': 1.45 };
  const rates = marketRates[player.position] ?? marketRates['LB'];
  let baseMarket = rates[rates.length - 1][1];
  for (let i = 0; i < rates.length - 1; i++) {
    const [highOvr, highSal] = rates[i];
    const [lowOvr, lowSal]   = rates[i + 1];
    if (player.overall_rating >= lowOvr) {
      const t = (player.overall_rating - lowOvr) / (highOvr - lowOvr);
      baseMarket = lowSal + t * (highSal - lowSal);
      break;
    }
  }
  const fairMarket = Math.round(baseMarket * (traitMul[player.dev_trait] ?? 1.0) * 10) / 10;
  const ratio = salary / Math.max(fairMarket, 1);

  // Loyalty bonus — slightly more willing to stay vs testing open market
  let acceptChance =
    ratio >= 1.00 ? 1.00 :
    ratio >= 0.85 ? 0.95 :
    ratio >= 0.70 ? 0.70 :
    ratio >= 0.50 ? 0.25 : 0.00;

  if (player.age >= 33) acceptChance = Math.min(1, acceptChance + 0.15);
  if (player.age >= 36) acceptChance = Math.min(1, acceptChance + 0.15);
  if (player.dev_trait === 'X-Factor')  acceptChance = Math.max(0, acceptChance - 0.15);
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

ipcMain.handle('import-otc-contracts', (_event: any, filePath?: string) => {
  const fs         = require('fs');
  const pathModule = require('path');

  // Auto-discover common filenames in project root
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

  const content: string  = fs.readFileSync(otcPath, 'utf8');
  const parseMoney = (s: string): number => parseFloat(s.replace(/[$,]/g, '')) || 0;
  const isHtml = content.trimStart().startsWith('<!') || content.includes('<table') || content.includes('<tr');

  const rows: any[] = [];

  if (isHtml) {
    const stripTags = (s: string) =>
      s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

    const trRegex = /<tr[\s\S]*?>([\s\S]*?)<\/tr>/gi;
    let trMatch: RegExpExecArray | null;
    while ((trMatch = trRegex.exec(content)) !== null) {
      const cells: string[] = [];
      const tdRegex = /<td[\s\S]*?>([\s\S]*?)<\/td>/gi;
      let tdMatch: RegExpExecArray | null;
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
        cells.push(stripTags(tdMatch[1]));
      }
      if (cells.length < 7) continue;
      const name = cells[0];
      if (!name || name === 'Player' || !name.match(/[A-Za-z]{2}/)) continue;
      const totalValue      = parseMoney(cells[3]);
      const apy             = parseMoney(cells[4]);
      const totalGuaranteed = parseMoney(cells[5]);
      const pctGuaranteed   = parseFloat((cells[7] ?? '0').replace('%', '')) || 0;
      if (apy <= 0) continue;
      rows.push({
        name,
        yearsRemaining:     Math.max(1, Math.round(totalValue / apy)),
        apyMillions:        Math.round(apy / 100_000) / 10,
        guaranteedMillions: Math.round(totalGuaranteed / 100_000) / 10,
        pctGuaranteed,
      });
    }
  } else {
    // Markdown table format
    for (const line of content.split('\n')) {
      if (!line.startsWith('|') || line.includes('---') || line.includes('Player') || line.includes('Pos.')) continue;
      const cols = line.split('|').map((c: string) => c.trim()).filter(Boolean);
      if (cols.length < 7) continue;
      const nameMatch = cols[0].match(/\[([^\]]+)\]/);
      if (!nameMatch) continue;
      const totalValue      = parseMoney(cols[3]);
      const apy             = parseMoney(cols[4]);
      const totalGuaranteed = parseMoney(cols[5]);
      const pctGuaranteed   = parseFloat((cols[7] ?? '0').replace('%', '')) || 0;
      if (apy <= 0) continue;
      rows.push({
        name:               nameMatch[1],
        yearsRemaining:     Math.max(1, Math.round(totalValue / apy)),
        apyMillions:        Math.round(apy / 100_000) / 10,
        guaranteedMillions: Math.round(totalGuaranteed / 100_000) / 10,
        pctGuaranteed,
      });
    }
  }

  if (rows.length === 0) {
    return { success: false, reason: `Parsed 0 rows from ${otcPath} — check file format.` };
  }

  const updateContract = db.prepare(`
    UPDATE contracts
    SET years_remaining   = ?,
        years_total       = MAX(years_total, ?),
        annual_salary     = ?,
        guaranteed_amount = ?,
        guaranteed_pct    = ?
    WHERE player_id = (
      SELECT p.id FROM players p
      WHERE p.first_name || ' ' || p.last_name = ?
        AND p.roster_status = 'active'
      LIMIT 1
    )
  `);

  let matched = 0, skipped = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      const r = updateContract.run(
        row.yearsRemaining, row.yearsRemaining,
        row.apyMillions, row.guaranteedMillions, row.pctGuaranteed,
        row.name
      );
      if (r.changes > 0) matched++; else skipped++;
    }
  });
  tx();
  return { success: true, matched, skipped, total: rows.length, file: otcPath, sampleNames: rows.slice(0, 8).map(r => r.name) };
});

// ─── Dev Trait Seeding ────────────────────────────────────────────────────────

ipcMain.handle('seed-dev-traits', () => {
  const setTrait = (firstName: string, lastName: string, trait: string) => {
    const player = db.prepare('SELECT id FROM players WHERE first_name = ? AND last_name = ?').get(firstName, lastName) as any;
    if (player) db.prepare('UPDATE players SET dev_trait = ? WHERE id = ?').run(trait, player.id);
  };
  setTrait('Drake',   'Maye',      'X-Factor');
  setTrait('Caleb',   'Williams',  'X-Factor');
  setTrait('Jayden',  'Daniels',   'Superstar');
  setTrait('Lamar',   'Jackson',   'X-Factor');
  setTrait('Patrick', 'Mahomes',   'X-Factor');
  setTrait('Josh',    'Allen',     'X-Factor');
  setTrait('Joe',     'Burrow',    'Superstar');
  setTrait('Jalen',   'Hurts',     'Superstar');
  setTrait('Justin',  'Jefferson', 'X-Factor');
  setTrait('CeeDee',  'Lamb',      'X-Factor');
  setTrait('Tyreek',  'Hill',      'X-Factor');
  setTrait('Brock',   'Bowers',    'Superstar');
  setTrait('Micah',   'Parsons',   'X-Factor');
  setTrait('Myles',   'Garrett',   'X-Factor');
  setTrait('T.J.',    'Watt',      'X-Factor');
  setTrait('Bo',      'Nix',       'Star');
  setTrait('Dak',     'Prescott',  'Star');
  return { success: true };
});

// ─── App Lifecycle ─────────────────────────────────────────────────────────────

app.on('ready', createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });