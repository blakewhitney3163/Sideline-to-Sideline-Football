import { ipcMain } from 'electron';
const { db } = require('../database');
const { simulateGame } = require('../simulateGame');
import { getCurrentSeason } from '../helpers/getCurrentSeason';
import { getDifficultyFactor } from './settingsHandlers';
import { POSITION_TO_GROUP, WAIVER_POS_MAX, SOFT_CAP_M, MAX_ACTIVE_ROSTER, MAX_PRACTICE_SQUAD, PS_MINIMUM_SALARY } from '../constants';
import { InjuredPlayer, Callup } from '../types';

// ─── Injury Helpers ───────────────────────────────────────────────────────────

const INJURY_TYPES = ['Hamstring', 'Ankle', 'Knee', 'Shoulder', 'Concussion', 'Rib', 'Back', 'Quad', 'Calf', 'Hand'];
const POS_INJURY_RISK: Record<string, number> = {
  QB: 0.025, RB: 0.055, WR: 0.035, TE: 0.035,
  OL: 0.020, DL: 0.025, LB: 0.035, CB: 0.035, S: 0.025, K: 0.008,
};

function rollInjuries(playerStats: any[]): InjuredPlayer[] {
  const newlyInjured: InjuredPlayer[] = [];
  for (const stat of playerStats) {
    const player = db.prepare('SELECT position, injury_status, team_id FROM players WHERE id = ?').get(stat.player_id) as any;
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

    newlyInjured.push({ player_id: stat.player_id, team_id: player.team_id, position: player.position, injury_status: status });
  }
  return newlyInjured;
}

function getPosGroup(pos: string): string[] {
  if (['RB', 'HB', 'FB'].includes(pos)) return ['RB', 'HB', 'FB'];
  if (['OL', 'LT', 'LG', 'C', 'RG', 'RT'].includes(pos)) return ['OL', 'LT', 'LG', 'C', 'RG', 'RT'];
  if (['DL', 'DE', 'DT', 'LE', 'RE', 'IDL'].includes(pos)) return ['DL', 'DE', 'DT', 'LE', 'RE', 'IDL'];
  if (['LB', 'MLB', 'OLB', 'LOLB', 'ROLB', 'ILB', 'WILL', 'MIKE'].includes(pos)) return ['LB', 'MLB', 'OLB', 'LOLB', 'ROLB', 'ILB', 'WILL', 'MIKE'];
  if (['S', 'FS', 'SS'].includes(pos)) return ['S', 'FS', 'SS'];
  return [pos];
}

function processWaivers(userTeamId: number, week: number): void {
  const season = getCurrentSeason();
  const waiverPlayers = db.prepare(`
    SELECT p.id, p.waived_by_team_id, p.position,
           COALESCE(c.annual_salary, 1.0) as annual_salary
    FROM players p
    LEFT JOIN contracts c ON c.player_id = p.id
    WHERE p.roster_status = 'waivers' AND p.waiver_placed_week < ?
    ORDER BY p.overall_rating DESC
  `).all(week) as any[];
  if (waiverPlayers.length === 0) return;

  const cpuTeams = db.prepare(`
    SELECT t.id,
           COUNT(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
                      OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 END) as wins
    FROM teams t
    LEFT JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
      AND g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
    WHERE t.id != ?
    GROUP BY t.id ORDER BY wins ASC
  `).all(season, userTeamId) as any[];

  const remaining = [...waiverPlayers];

  for (const team of cpuTeams) {
    if (remaining.length === 0) break;

    const active = (db.prepare(
      "SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'active'"
    ).get(team.id) as any).count;
    if (active >= MAX_ACTIVE_ROSTER) continue;

    const teamSalary = (db.prepare(`
      SELECT COALESCE(SUM(c.annual_salary), 0) as total
      FROM contracts c
      JOIN players p ON c.player_id = p.id
      WHERE p.team_id = ?
    `).get(team.id) as any).total;

    let claimedIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      if (p.waived_by_team_id === team.id) continue;
      if (teamSalary + p.annual_salary > SOFT_CAP_M) continue;

      const posGroup = POSITION_TO_GROUP[p.position] ?? p.position;
      const maxAtPos = WAIVER_POS_MAX[posGroup] ?? 5;
      const groupPositions = getPosGroup(p.position);
      const placeholders = groupPositions.map(() => '?').join(',');
      const groupCount = (db.prepare(
        `SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'active' AND position IN (${placeholders})`
      ).get(team.id, ...groupPositions) as any).count;

      if (groupCount >= maxAtPos) continue;
      claimedIdx = i;
      break;
    }
    if (claimedIdx === -1) continue;

    const claimed = remaining.splice(claimedIdx, 1)[0];
    db.prepare("UPDATE players SET team_id = ?, roster_status = 'active', is_free_agent = 0, waived_by_team_id = NULL, waiver_placed_week = NULL WHERE id = ?")
      .run(team.id, claimed.id);
    const existing = db.prepare('SELECT id FROM contracts WHERE player_id = ?').get(claimed.id);
    if (existing) {
      db.prepare('UPDATE contracts SET team_id = ? WHERE player_id = ?').run(team.id, claimed.id);
    } else {
      db.prepare('INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct) VALUES (?, ?, 1, 1, ?, 0, 0)')
        .run(claimed.id, team.id, claimed.annual_salary);
    }
  }

  for (const p of remaining) {
    db.prepare('DELETE FROM contracts WHERE player_id = ?').run(p.id);
    db.prepare("UPDATE players SET roster_status = 'free_agent', is_free_agent = 1, waived_by_team_id = NULL, waiver_placed_week = NULL WHERE id = ?").run(p.id);
  }
}

function processRosterAdjustments(
  newlyInjured: InjuredPlayer[],
  userTeamId: number
): { callups: Callup[]; userPSOpenSpots: number } {
  const callups: Callup[] = [];

  for (const injured of newlyInjured.filter(p => p.injury_status === 'out' || p.injury_status === 'ir')) {
    const group = getPosGroup(injured.position);
    const placeholders = group.map(() => '?').join(', ');
    const psPlayer = db.prepare(`
      SELECT id, first_name, last_name, position
      FROM players WHERE team_id = ? AND roster_status = 'practice_squad'
      AND position IN (${placeholders})
      ORDER BY overall_rating DESC LIMIT 1
    `).get(injured.team_id, ...group) as any;

    if (psPlayer) {
      const activeCount = (db.prepare(
        "SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'active'"
      ).get(injured.team_id) as any).count;
      if (activeCount < MAX_ACTIVE_ROSTER) {
        db.prepare("UPDATE players SET roster_status = 'active' WHERE id = ?").run(psPlayer.id);
        const teamRow = db.prepare('SELECT city, name FROM teams WHERE id = ?').get(injured.team_id) as any;
        callups.push({
          name: `${psPlayer.first_name} ${psPlayer.last_name}`,
          position: psPlayer.position,
          teamName: teamRow ? `${teamRow.city} ${teamRow.name}` : 'Unknown',
          isUserTeam: injured.team_id === userTeamId,
        });
      }
    }
  }

  const allTeams = db.prepare('SELECT id FROM teams').all() as any[];
  for (const team of allTeams) {
    if (team.id === userTeamId) continue;
    const psCount = (db.prepare(
      "SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'practice_squad'"
    ).get(team.id) as any).count;
    const openSpots = MAX_PRACTICE_SQUAD - psCount;
    if (openSpots <= 0) continue;

    const fas = db.prepare(
      "SELECT id FROM players WHERE team_id IS NULL ORDER BY overall_rating DESC LIMIT ?"
    ).all(openSpots) as any[];

    for (const fa of fas) {
      db.prepare("UPDATE players SET team_id = ?, roster_status = 'practice_squad' WHERE id = ?")
        .run(team.id, fa.id);
      const existing = db.prepare('SELECT id FROM contracts WHERE player_id = ?').get(fa.id);
      if (existing) {
        db.prepare(
          'UPDATE contracts SET team_id = ?, years_total = 1, years_remaining = 1, annual_salary = ?, guaranteed_amount = 0, guaranteed_pct = 0 WHERE player_id = ?'
        ).run(team.id, PS_MINIMUM_SALARY, fa.id);
      } else {
        db.prepare(
          'INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct) VALUES (?, ?, 1, 1, ?, 0, 0)'
        ).run(fa.id, team.id, PS_MINIMUM_SALARY);
      }
    }
  }

  const userPSCount = (db.prepare(
    "SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'practice_squad'"
  ).get(userTeamId) as any).count;

  return { callups, userPSOpenSpots: Math.max(0, MAX_PRACTICE_SQUAD - userPSCount) };
}

// ─── Register Handlers ────────────────────────────────────────────────────────

export function registerSimHandlers(): void {

  ipcMain.handle('get-waiver-wire', () => {
    const teamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
    const userTeamId = teamRow ? parseInt(teamRow.value) : -1;
    const players = db.prepare(`
      SELECT id, first_name, last_name, position, position_label,
             overall_rating, age, dev_trait,
             speed, strength, awareness, waived_by_team_id
      FROM players WHERE roster_status = 'waivers'
      ORDER BY overall_rating DESC
    `).all() as any[];
    return players.map((p: any) => ({ ...p, canClaim: p.waived_by_team_id !== userTeamId }));
  });

  ipcMain.handle('claim-waiver', (_event: any, playerId: number) => {
    const teamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
    if (!teamRow) return { success: false, reason: 'No franchise selected.' };
    const teamId = parseInt(teamRow.value);

    const active = (db.prepare(
      "SELECT COUNT(*) as count FROM players WHERE team_id = ? AND roster_status = 'active'"
    ).get(teamId) as any).count;
    if (active >= MAX_ACTIVE_ROSTER) return { success: false, reason: `Active roster is full (${MAX_ACTIVE_ROSTER}/${MAX_ACTIVE_ROSTER}). Release a player first.` };

    const player = db.prepare(
      'SELECT * FROM players WHERE id = ? AND roster_status = ?'
    ).get(playerId, 'waivers') as any;
    if (!player) return { success: false, reason: 'Player no longer on waivers.' };

    if (player.waived_by_team_id === teamId) {
      return { success: false, reason: 'You cannot re-claim a player you just released to waivers.' };
    }

    db.prepare("UPDATE players SET team_id = ?, roster_status = 'active', is_free_agent = 0, waived_by_team_id = NULL WHERE id = ?")
      .run(teamId, playerId);

    const existing = db.prepare('SELECT id FROM contracts WHERE player_id = ?').get(playerId);
    if (existing) {
      db.prepare('UPDATE contracts SET team_id = ? WHERE player_id = ?').run(teamId, playerId);
    } else {
      db.prepare('INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary, guaranteed_amount, guaranteed_pct) VALUES (?, ?, 1, 1, 1.0, 0, 0)')
        .run(playerId, teamId);
    }

    return { success: true, name: `${player.first_name} ${player.last_name}` };
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
    const insertGame = db.prepare(`INSERT INTO games (season, week, home_team_id, away_team_id, home_score, away_score, home_q1, home_q2, home_q3, home_q4, away_q1, away_q2, away_q3, away_q4, weather, is_playoff, is_simulated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`);

    const simGame = (homeTeam: any, awayTeam: any, week: number) => {
      const result = simulateGame(homeTeam.id, awayTeam.id);
      insertGame.run(s, week, homeTeam.id, awayTeam.id, result.homeScore, result.awayScore, result.homeQuarters[0], result.homeQuarters[1], result.homeQuarters[2], result.homeQuarters[3], result.awayQuarters[0], result.awayQuarters[1], result.awayQuarters[2], result.awayQuarters[3], result.weather ?? 'clear');
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

    const updateGame = db.prepare('UPDATE games SET home_score = ?, away_score = ?, home_q1 = ?, home_q2 = ?, home_q3 = ?, home_q4 = ?, away_q1 = ?, away_q2 = ?, away_q3 = ?, away_q4 = ?, weather = ?, is_simulated = 1 WHERE id = ?');
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
    const userTeamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
    const userTeamId = userTeamRow ? parseInt(userTeamRow.value) : -1;

    const runWeek = db.transaction(() => {
      for (const game of games) {
        const result = simulateGame(game.home_team_id, game.away_team_id, game.week ?? 1, userTeamId, getDifficultyFactor());
        updateGame.run(result.homeScore, result.awayScore, result.homeQuarters[0], result.homeQuarters[1], result.homeQuarters[2], result.homeQuarters[3], result.awayQuarters[0], result.awayQuarters[1], result.awayQuarters[2], result.awayQuarters[3], result.weather ?? 'clear', game.id);
        for (const stat of [...result.homePlayerStats, ...result.awayPlayerStats]) {
          insertStat.run({ game_id: game.id, ...stat });
          allStats.push(stat);
        }
      }
    });
    runWeek();

    const newlyInjured = rollInjuries(allStats);
    const rosterResult = processRosterAdjustments(newlyInjured, userTeamId);
    processWaivers(userTeamId, week);
    return { week, season, gamesSimulated: games.length, callups: rosterResult.callups, userPSOpenSpots: rosterResult.userPSOpenSpots };
  });

  ipcMain.handle('simulate-game', (_event: any, gameId: number) => {
    const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(gameId) as any;
    if (!game) return { success: false, reason: 'Game not found.' };
    if (game.is_simulated) return { success: false, reason: 'Game already simulated.' };

    const updateGame = db.prepare('UPDATE games SET home_score = ?, away_score = ?, home_q1 = ?, home_q2 = ?, home_q3 = ?, home_q4 = ?, away_q1 = ?, away_q2 = ?, away_q3 = ?, away_q4 = ?, weather = ?, is_simulated = 1 WHERE id = ?');
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

    let gameResult: any;
    const allStats: any[] = [];
    const userTeamRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
    const userTeamId = userTeamRow ? parseInt(userTeamRow.value) : -1;

    const runGame = db.transaction(() => {
      gameResult = simulateGame(game.home_team_id, game.away_team_id, game.week ?? 1, userTeamId, getDifficultyFactor());
      updateGame.run(
        gameResult.homeScore, gameResult.awayScore,
        gameResult.homeQuarters[0], gameResult.homeQuarters[1], gameResult.homeQuarters[2], gameResult.homeQuarters[3],
        gameResult.awayQuarters[0], gameResult.awayQuarters[1], gameResult.awayQuarters[2], gameResult.awayQuarters[3],
        gameResult.weather ?? 'clear', game.id
      );
      for (const stat of [...gameResult.homePlayerStats, ...gameResult.awayPlayerStats]) {
        insertStat.run({ game_id: game.id, ...stat });
        allStats.push(stat);
      }
    });
    runGame();

    const remaining = (db.prepare(
      `SELECT COUNT(*) as cnt FROM games WHERE season = ? AND week = ? AND is_simulated = 0 AND is_playoff = 0`
    ).get(game.season, game.week) as any).cnt;
    const weekComplete = remaining === 0;

    const newlyInjured = rollInjuries(allStats);
    const rosterResult = processRosterAdjustments(newlyInjured, userTeamId);

    if (weekComplete) {
      db.prepare(`UPDATE players SET weeks_out = MAX(0, weeks_out - 1) WHERE weeks_out > 0`).run();
      db.prepare(`UPDATE players SET injury_status = 'healthy', injury_type = NULL WHERE weeks_out = 0 AND injury_status != 'healthy'`).run();
      processWaivers(userTeamId, game.week);
    }

    return {
      success: true,
      gameId,
      weekComplete,
      homeScore: gameResult.homeScore,
      awayScore: gameResult.awayScore,
      callups: rosterResult.callups,
      userPSOpenSpots: rosterResult.userPSOpenSpots,
    };
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
             g.home_q1, g.home_q2, g.home_q3, g.home_q4,
             g.away_q1, g.away_q2, g.away_q3, g.away_q4,
             ht.id as home_team_id, ht.city || ' ' || ht.name AS home_team,
             at.id as away_team_id, at.city || ' ' || at.name AS away_team
      FROM games g JOIN teams ht ON g.home_team_id = ht.id JOIN teams at ON g.away_team_id = at.id WHERE g.id = ?
    `).get(gameId) as any;
    if (!game) return null;
    const players = db.prepare(`
      SELECT p.first_name || ' ' || p.last_name as player_name, p.position, s.team_id,
             s.pass_attempts, s.completions, s.pass_yards, s.pass_tds, s.interceptions,
             s.rush_attempts, s.rush_yards, s.rush_tds, s.targets, s.receptions, s.rec_yards, s.rec_tds,
             s.tackles, s.assisted_tackles, s.sacks, s.tfl, s.def_interceptions, s.pass_deflections
      FROM stats s JOIN players p ON s.player_id = p.id
      WHERE s.game_id = ? AND (s.pass_yards > 0 OR s.rush_yards > 0 OR s.rec_yards > 0 OR s.tackles > 2 OR s.sacks > 0)
      ORDER BY s.team_id, s.pass_yards DESC, s.rush_yards DESC, s.rec_yards DESC
    `).all(gameId);
    return { game, players };
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
}
