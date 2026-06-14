import { app, BrowserWindow, ipcMain } from 'electron';
const db = require('./database');
const { simulateGame } = require('./simulateGame');

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require('electron-squirrel-startup')) {
  app.quit();
}

// ─── Window ───────────────────────────────────────────────────────────────────

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

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-standings', (_event: any, season?: number) => {
  const s = season ?? getCurrentSeason();
  const teams = db.prepare('SELECT id, city, name, conference, division FROM teams').all();
  return teams.map((team: any) => {
    const wins = db.prepare(`
      SELECT COUNT(*) as count FROM games
      WHERE season = ? AND is_simulated = 1
      AND ((home_team_id = ? AND home_score > away_score)
        OR (away_team_id = ? AND away_score > home_score))
    `).get(s, team.id, team.id).count;
    const losses = db.prepare(`
      SELECT COUNT(*) as count FROM games
      WHERE season = ? AND is_simulated = 1
      AND ((home_team_id = ? AND home_score < away_score)
        OR (away_team_id = ? AND away_score < home_score))
    `).get(s, team.id, team.id).count;
    return { ...team, wins, losses };
  });
});

ipcMain.handle('get-teams', () => {
  return db.prepare('SELECT * FROM teams ORDER BY conference, division, name').all();
});

ipcMain.handle('get-roster', (_event: any, teamId: number) => {
  return db.prepare(`
    SELECT id, first_name, last_name, position, position_label, overall_rating, age, speed, strength, awareness
    FROM players WHERE team_id = ?
    ORDER BY
      CASE position
        WHEN 'QB' THEN 1 WHEN 'RB' THEN 2 WHEN 'WR' THEN 3 WHEN 'TE' THEN 4
        WHEN 'OL' THEN 5 WHEN 'DL' THEN 6 WHEN 'LB' THEN 7 WHEN 'CB' THEN 8
        WHEN 'S' THEN 9 WHEN 'K' THEN 10 ELSE 11
      END,
      overall_rating DESC
  `).all(teamId);
});

ipcMain.handle('get-player-stats', (_event: any, playerId: number) => {
  const season = getCurrentSeason();
  return db.prepare(`
    SELECT
      COUNT(DISTINCT s.game_id) as games,
      SUM(s.pass_attempts) as pass_attempts, SUM(s.completions) as completions,
      SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds,
      SUM(s.interceptions) as interceptions,
      SUM(s.rush_attempts) as rush_attempts, SUM(s.rush_yards) as rush_yards,
      SUM(s.rush_tds) as rush_tds,
      SUM(s.targets) as targets, SUM(s.receptions) as receptions,
      SUM(s.rec_yards) as rec_yards, SUM(s.rec_tds) as rec_tds
    FROM stats s
    JOIN games g ON s.game_id = g.id
    WHERE s.player_id = ? AND g.season = ?
  `).get(playerId, season);
});

ipcMain.handle('get-player-career-stats', (_event: any, playerId: number) => {
  return db.prepare(`
    SELECT
      g.season,
      COUNT(DISTINCT s.game_id) as games,
      SUM(s.pass_attempts) as pass_attempts, SUM(s.completions) as completions,
      SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds,
      SUM(s.interceptions) as interceptions,
      SUM(s.rush_attempts) as rush_attempts, SUM(s.rush_yards) as rush_yards,
      SUM(s.rush_tds) as rush_tds,
      SUM(s.targets) as targets, SUM(s.receptions) as receptions,
      SUM(s.rec_yards) as rec_yards, SUM(s.rec_tds) as rec_tds
    FROM stats s
    JOIN games g ON s.game_id = g.id
    WHERE s.player_id = ?
    GROUP BY g.season
    ORDER BY g.season DESC
  `).all(playerId);
});

ipcMain.handle('get-schedule', (_event: any, season?: number) => {
  const s = season ?? getCurrentSeason();
  return db.prepare(`
    SELECT g.id, g.week, g.home_score, g.away_score,
      ht.city || ' ' || ht.name AS home_team,
      at.city || ' ' || at.name AS away_team
    FROM games g
    JOIN teams ht ON g.home_team_id = ht.id
    JOIN teams at ON g.away_team_id = at.id
    WHERE g.season = ? AND g.is_simulated = 1
    ORDER BY g.week, g.id
  `).all(s);
});

ipcMain.handle('get-dashboard', (_event: any, season?: number) => {
  const s = season ?? getCurrentSeason();
  const topAFC = db.prepare(`
    SELECT t.city || ' ' || t.name AS team_name,
      SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
        OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score)
        OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0 END) AS losses
    FROM teams t
    JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
    WHERE g.season = ? AND g.is_simulated = 1 AND t.conference = 'AFC'
    GROUP BY t.id ORDER BY wins DESC LIMIT 5
  `).all(s);
  const topNFC = db.prepare(`
    SELECT t.city || ' ' || t.name AS team_name,
      SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
        OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) AS wins,
      SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score)
        OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0 END) AS losses
    FROM teams t
    JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
    WHERE g.season = ? AND g.is_simulated = 1 AND t.conference = 'NFC'
    GROUP BY t.id ORDER BY wins DESC LIMIT 5
  `).all(s);
  const recentGames = db.prepare(`
    SELECT g.week, g.home_score, g.away_score,
      ht.city || ' ' || ht.name AS home_team,
      at.city || ' ' || at.name AS away_team
    FROM games g
    JOIN teams ht ON g.home_team_id = ht.id
    JOIN teams at ON g.away_team_id = at.id
    WHERE g.season = ? AND g.is_simulated = 1
    ORDER BY g.week DESC, g.id DESC LIMIT 8
  `).all(s);
  return { topAFC, topNFC, recentGames };
});

ipcMain.handle('get-stats', (_event: any, season?: number) => {
  const s = season ?? getCurrentSeason();
  const passing = db.prepare(`
    SELECT p.first_name || ' ' || p.last_name AS player_name,
      t.city || ' ' || t.name AS team_name,
      SUM(st.pass_yards) AS pass_yards, SUM(st.pass_tds) AS pass_tds,
      SUM(st.interceptions) AS interceptions, SUM(st.completions) AS completions,
      SUM(st.pass_attempts) AS pass_attempts
    FROM stats st
    JOIN players p ON st.player_id = p.id
    JOIN teams t ON st.team_id = t.id
    JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.pass_attempts > 0
    GROUP BY p.id ORDER BY pass_yards DESC LIMIT 15
  `).all(s);
  const rushing = db.prepare(`
    SELECT p.first_name || ' ' || p.last_name AS player_name,
      t.city || ' ' || t.name AS team_name,
      SUM(st.rush_yards) AS rush_yards, SUM(st.rush_tds) AS rush_tds,
      SUM(st.rush_attempts) AS rush_attempts
    FROM stats st
    JOIN players p ON st.player_id = p.id
    JOIN teams t ON st.team_id = t.id
    JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.rush_attempts > 0
    GROUP BY p.id ORDER BY rush_yards DESC LIMIT 15
  `).all(s);
  const receiving = db.prepare(`
    SELECT p.first_name || ' ' || p.last_name AS player_name,
      t.city || ' ' || t.name AS team_name,
      SUM(st.rec_yards) AS rec_yards, SUM(st.rec_tds) AS rec_tds,
      SUM(st.receptions) AS receptions, SUM(st.targets) AS targets
    FROM stats st
    JOIN players p ON st.player_id = p.id
    JOIN teams t ON st.team_id = t.id
    JOIN games g ON st.game_id = g.id
    WHERE g.season = ? AND g.is_simulated = 1 AND st.targets > 0
    GROUP BY p.id ORDER BY rec_yards DESC LIMIT 15
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
      const wins = db.prepare(`
        SELECT COUNT(*) as count FROM games
        WHERE season = ? AND is_simulated = 1 AND is_playoff = 0
        AND ((home_team_id = ? AND home_score > away_score)
          OR (away_team_id = ? AND away_score > home_score))
      `).get(s, t.id, t.id).count;
      return { ...t, wins };
    }).sort((a: any, b: any) => b.wins - a.wins).slice(0, 7);
  };

  const afcTeams = seedTeams('AFC');
  const nfcTeams = seedTeams('NFC');

  const insertGame = db.prepare(`
    INSERT INTO games (season, week, home_team_id, away_team_id, home_score, away_score, is_playoff, is_simulated)
    VALUES (?, ?, ?, ?, ?, ?, 1, 1)
  `);

  const simGame = (homeTeam: any, awayTeam: any, week: number) => {
    const result = simulateGame(homeTeam.id, awayTeam.id);
    insertGame.run(s, week, homeTeam.id, awayTeam.id, result.homeScore, result.awayScore);
    const winner = result.homeScore > result.awayScore ? homeTeam : awayTeam;
    return { home: homeTeam, away: awayTeam, homeScore: result.homeScore, awayScore: result.awayScore, winner };
  };

  const afcWC = [
    simGame(afcTeams[1], afcTeams[6], 18),
    simGame(afcTeams[2], afcTeams[5], 18),
    simGame(afcTeams[3], afcTeams[4], 18),
  ];
  const nfcWC = [
    simGame(nfcTeams[1], nfcTeams[6], 18),
    simGame(nfcTeams[2], nfcTeams[5], 18),
    simGame(nfcTeams[3], nfcTeams[4], 18),
  ];
  const afcDiv = [
    simGame(afcTeams[0], afcWC[2].winner, 19),
    simGame(afcWC[0].winner, afcWC[1].winner, 19),
  ];
  const nfcDiv = [
    simGame(nfcTeams[0], nfcWC[2].winner, 19),
    simGame(nfcWC[0].winner, nfcWC[1].winner, 19),
  ];
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
      ht.city || ' ' || ht.name AS home_team,
      at.city || ' ' || at.name AS away_team
    FROM games g
    JOIN teams ht ON g.home_team_id = ht.id
    JOIN teams at ON g.away_team_id = at.id
    WHERE g.season = ? AND g.is_playoff = 1
    ORDER BY g.week, g.id
  `).all(s);
});

ipcMain.handle('get-champions', () => {
  return db.prepare(`
    SELECT c.season, t.city || ' ' || t.name AS team_name, t.conference
    FROM champions c
    JOIN teams t ON c.team_id = t.id
    ORDER BY c.season DESC
  `).all();
});

ipcMain.handle('get-seasons', () => {
  return db.prepare(`
    SELECT DISTINCT season FROM games WHERE is_simulated = 1 ORDER BY season DESC
  `).all().map((r: any) => r.season);
});

ipcMain.handle('get-current-season', () => getCurrentSeason());

ipcMain.handle('advance-season', () => {
  const current = getCurrentSeason();
  const next = current + 1;
  db.prepare('UPDATE players SET age = age + 1').run();
  db.prepare(`
    UPDATE players SET team_id = NULL, is_free_agent = 1
    WHERE age >= 39 AND overall_rating < 78 AND is_free_agent = 0
  `).run();
  db.prepare("UPDATE settings SET value = ? WHERE key = 'current_season'").run(String(next));
  return { nextSeason: next };
});

// ─── Week-by-Week Simulation ──────────────────────────────────────────────────

ipcMain.handle('generate-schedule', () => {
  const season = getCurrentSeason();
  const existing = (db.prepare(
    'SELECT COUNT(*) as count FROM games WHERE season = ? AND is_playoff = 0'
  ).get(season) as any).count;

  if (existing > 0) return { alreadyExists: true, season };

  const teams = db.prepare('SELECT id FROM teams').all() as any[];
  const insertGame = db.prepare(
    'INSERT INTO games (season, week, home_team_id, away_team_id, is_simulated) VALUES (?, ?, ?, ?, 0)'
  );

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
  const total = (db.prepare(
    'SELECT COUNT(*) as count FROM games WHERE season = ? AND is_playoff = 0'
  ).get(season) as any).count;

  if (total === 0) return { hasSchedule: false, currentWeek: null };

  const row = db.prepare(`
    SELECT MIN(week) as week FROM games
    WHERE season = ? AND is_simulated = 0 AND is_playoff = 0
  `).get(season) as any;

  return { hasSchedule: true, currentWeek: row?.week ?? null };
});

ipcMain.handle('get-week-matchups', (_event: any, week: number) => {
  const season = getCurrentSeason();
  return db.prepare(`
    SELECT g.id, g.week, g.home_score, g.away_score, g.is_simulated,
      ht.id as home_team_id, ht.city || ' ' || ht.name AS home_team,
      at.id as away_team_id, at.city || ' ' || at.name AS away_team
    FROM games g
    JOIN teams ht ON g.home_team_id = ht.id
    JOIN teams at ON g.away_team_id = at.id
    WHERE g.season = ? AND g.week = ? AND g.is_playoff = 0
    ORDER BY g.id
  `).all(season, week);
});

ipcMain.handle('simulate-week', (_event: any, week: number) => {
  const season = getCurrentSeason();
  const games = db.prepare(`
    SELECT id, home_team_id, away_team_id FROM games
    WHERE season = ? AND week = ? AND is_simulated = 0 AND is_playoff = 0
  `).all(season, week) as any[];

  if (games.length === 0) return { week, season, gamesSimulated: 0 };

  const updateGame = db.prepare(
    'UPDATE games SET home_score = ?, away_score = ?, is_simulated = 1 WHERE id = ?'
  );
  const insertStat = db.prepare(`
    INSERT INTO stats (
      game_id, player_id, team_id,
      pass_attempts, completions, pass_yards, pass_tds, interceptions,
      rush_attempts, rush_yards, rush_tds,
      targets, receptions, rec_yards, rec_tds
    ) VALUES (
      @game_id, @player_id, @team_id,
      @pass_attempts, @completions, @pass_yards, @pass_tds, @interceptions,
      @rush_attempts, @rush_yards, @rush_tds,
      @targets, @receptions, @rec_yards, @rec_tds
    )
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
    FROM games g
    JOIN teams ht ON g.home_team_id = ht.id
    JOIN teams at ON g.away_team_id = at.id
    WHERE g.id = ?
  `).get(gameId) as any;

  if (!game) return null;

  const players = db.prepare(`
    SELECT
      p.first_name || ' ' || p.last_name as player_name,
      p.position, s.team_id,
      s.pass_attempts, s.completions, s.pass_yards, s.pass_tds, s.interceptions,
      s.rush_attempts, s.rush_yards, s.rush_tds,
      s.targets, s.receptions, s.rec_yards, s.rec_tds
    FROM stats s
    JOIN players p ON s.player_id = p.id
    WHERE s.game_id = ?
      AND (s.pass_yards > 0 OR s.rush_yards > 0 OR s.rec_yards > 0)
    ORDER BY s.team_id, s.pass_yards DESC, s.rush_yards DESC, s.rec_yards DESC
  `).all(gameId);

  return { game, players };
});

// Reset Dynasty handler
ipcMain.handle('reset-dynasty', () => {
  db.prepare('DELETE FROM stats').run();
  db.prepare('DELETE FROM games').run();
  db.prepare('DELETE FROM champions').run();
  db.prepare("UPDATE settings SET value = '2025' WHERE key = 'current_season'").run();
  return { success: true };
});

// Playoff Seeds Handler
ipcMain.handle('get-playoff-seeds', () => {
  const season = getCurrentSeason();

  const getConferenceSeeds = (conference: string) => {
    const teams = db.prepare(
      'SELECT id, city, name FROM teams WHERE conference = ?'
    ).all(conference) as any[];

    return teams.map((t: any) => {
      const wins = (db.prepare(`
        SELECT COUNT(*) as count FROM games
        WHERE season = ? AND is_simulated = 1 AND is_playoff = 0
        AND ((home_team_id = ? AND home_score > away_score)
          OR (away_team_id = ? AND away_score > home_score))
      `).get(season, t.id, t.id) as any).count;

      const losses = (db.prepare(`
        SELECT COUNT(*) as count FROM games
        WHERE season = ? AND is_simulated = 1 AND is_playoff = 0
        AND ((home_team_id = ? AND home_score < away_score)
          OR (away_team_id = ? AND away_score < home_score))
      `).get(season, t.id, t.id) as any).count;

      return { ...t, wins, losses, team_name: `${t.city} ${t.name}` };
    })
    .sort((a: any, b: any) => b.wins - a.wins)
    .slice(0, 7);
  };

  return {
    afc: getConferenceSeeds('AFC'),
    nfc: getConferenceSeeds('NFC'),
  };
});

// User Team Selection
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

// ─── App Lifecycle ─────────────────────────────────────────────────────────────

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});