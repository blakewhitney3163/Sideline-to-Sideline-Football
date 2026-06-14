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

// Read the current season from the settings table
function getCurrentSeason(): number {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'current_season'").get() as any;
  return row ? parseInt(row.value) : 2025;
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Returns all 32 teams with win/loss record for the given season
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

// Returns all teams sorted by conference, division, and name
ipcMain.handle('get-teams', () => {
  return db.prepare('SELECT * FROM teams ORDER BY conference, division, name').all();
});

// Returns the full roster for a given team, sorted by overall rating
ipcMain.handle('get-roster', (_event: any, teamId: number) => {
  return db.prepare(`
    SELECT first_name, last_name, position, overall_rating, age, speed, strength, awareness
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

// Returns all games for a given season with team names and scores
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

// Returns dashboard summary: top 5 teams per conference and recent scores
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

// Returns league leaders grouped by stat category
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

// Simulate the full playoff bracket and save to DB
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

  return {
    afc: { seeds: afcTeams, wildCard: afcWC, divisional: afcDiv, championship: afcChamp },
    nfc: { seeds: nfcTeams, wildCard: nfcWC, divisional: nfcDiv, championship: nfcChamp },
    superBowl,
  };
});

// Fetch existing playoff results
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

// Get the current season year
ipcMain.handle('get-current-season', () => getCurrentSeason());

// Advance to the next season
ipcMain.handle('advance-season', () => {
  const next = getCurrentSeason() + 1;
  db.prepare("UPDATE settings SET value = ? WHERE key = 'current_season'").run(String(next));
  return next;
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