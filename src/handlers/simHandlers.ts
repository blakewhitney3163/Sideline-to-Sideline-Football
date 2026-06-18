import { ipcMain } from 'electron';
const { db } = require('../database');
import { simulateGame } from '../simulateGame';
import { getCurrentSeason } from '../helpers/getCurrentSeason';
import { getDifficultyFactor } from './settingsHandlers';
import { POSITION_TO_GROUP, WAIVER_POS_MAX, SOFT_CAP_M, MAX_ACTIVE_ROSTER, MAX_PRACTICE_SQUAD } from '../constants';
import { InjuredPlayer, Callup } from '../types';
import { settingsRepo, playerRepo, contractRepo, gameRepo } from '../repositories';

// ─── Injury Helpers ───────────────────────────────────────────────────────────

const INJURY_TYPES = ['Hamstring', 'Ankle', 'Knee', 'Shoulder', 'Concussion', 'Rib', 'Back', 'Quad', 'Calf', 'Hand'];
const POS_INJURY_RISK: Record<string, number> = {
  QB: 0.025, RB: 0.055, WR: 0.035, TE: 0.035,
  OL: 0.020, DL: 0.025, LB: 0.035, CB: 0.035, S: 0.025, K: 0.008,
};

function rollInjuries(playerStats: any[]): InjuredPlayer[] {
  const newlyInjured: InjuredPlayer[] = [];
  for (const stat of playerStats) {
    const player = playerRepo.getById(stat.player_id);
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
    playerRepo.updateInjury(stat.player_id, status, weeksOut, injuryType);
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
    if (playerRepo.getActiveCount(team.id) >= MAX_ACTIVE_ROSTER) continue;

    const teamSalary = (db.prepare(`
      SELECT COALESCE(SUM(c.annual_salary), 0) as total
      FROM contracts c JOIN players p ON c.player_id = p.id WHERE p.team_id = ?
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
    const existingContract = contractRepo.getByPlayer(claimed.id);
    if (existingContract) {
      contractRepo.updateTeam(claimed.id, team.id);
    } else {
      contractRepo.create(claimed.id, team.id, 1, claimed.annual_salary, 0, 0);
    }
  }

  for (const p of remaining) {
    contractRepo.delete(p.id);
    playerRepo.releaseToFA(p.id);
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

    if (psPlayer && playerRepo.getActiveCount(injured.team_id) < MAX_ACTIVE_ROSTER) {
      playerRepo.updateRosterStatus(psPlayer.id, 'active');
      const teamRow = db.prepare('SELECT city, name FROM teams WHERE id = ?').get(injured.team_id) as any;
      callups.push({
        name: `${psPlayer.first_name} ${psPlayer.last_name}`,
        position: psPlayer.position,
        teamName: teamRow ? `${teamRow.city} ${teamRow.name}` : 'Unknown',
        isUserTeam: injured.team_id === userTeamId,
      });
    }
  }

  const allTeams = db.prepare('SELECT id FROM teams').all() as any[];
  for (const team of allTeams) {
    if (team.id === userTeamId) continue;
    const openSpots = MAX_PRACTICE_SQUAD - playerRepo.getPSCount(team.id);
    if (openSpots <= 0) continue;

    const fas = db.prepare(
      "SELECT id FROM players WHERE team_id IS NULL ORDER BY overall_rating DESC LIMIT ?"
    ).all(openSpots) as any[];

    for (const fa of fas) {
      playerRepo.assignToPS(fa.id, team.id);
      contractRepo.createPS(fa.id, team.id);
    }
  }

  return { callups, userPSOpenSpots: Math.max(0, MAX_PRACTICE_SQUAD - playerRepo.getPSCount(userTeamId)) };
}

// ─── Register Handlers ────────────────────────────────────────────────────────

export function registerSimHandlers(): void {

  ipcMain.handle('get-waiver-wire', () => {
    const userTeamId = settingsRepo.getUserTeamId() ?? -1;
    return playerRepo.getOnWaivers(userTeamId);
  });

  ipcMain.handle('claim-waiver', (_event: any, playerId: number) => {
    const teamId = settingsRepo.getUserTeamId();
    if (!teamId) return { success: false, reason: 'No franchise selected.' };

    if (playerRepo.getActiveCount(teamId) >= MAX_ACTIVE_ROSTER)
      return { success: false, reason: `Active roster is full (${MAX_ACTIVE_ROSTER}/${MAX_ACTIVE_ROSTER}). Release a player first.` };

    const player = playerRepo.getById(playerId);
    if (!player || player.roster_status !== 'waivers') return { success: false, reason: 'Player no longer on waivers.' };
    if (player.waived_by_team_id === teamId) return { success: false, reason: 'You cannot re-claim a player you just released to waivers.' };

    db.prepare("UPDATE players SET team_id = ?, roster_status = 'active', is_free_agent = 0, waived_by_team_id = NULL WHERE id = ?")
      .run(teamId, playerId);

    const existingContract = contractRepo.getByPlayer(playerId);
    if (existingContract) {
      contractRepo.updateTeam(playerId, teamId);
    } else {
      contractRepo.create(playerId, teamId, 1, 1.0, 0, 0);
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
    if (gameRepo.countBySeason(season) > 0) return { alreadyExists: true, season };

    const teams = (db.prepare('SELECT id FROM teams').all() as any[]).map((t: any) => t.id);
    const insertGame = db.prepare('INSERT INTO games (season, week, home_team_id, away_team_id, is_simulated) VALUES (?, ?, ?, ?, 0)');

    const shuffledForByes = [...teams].sort(() => Math.random() - 0.5);
    const byeWeekMap: Record<number, number> = {};
    for (let i = 0; i < shuffledForByes.length; i++) {
      byeWeekMap[shuffledForByes[i]] = 5 + Math.floor(i / 4);
    }

    const create = db.transaction(() => {
      for (let week = 1; week <= 18; week++) {
        const playing = teams.filter((id: number) => byeWeekMap[id] !== week);
        const shuffled = [...playing].sort(() => Math.random() - 0.5);
        const pairs = Math.floor(shuffled.length / 2);
        for (let i = 0; i < pairs; i++) {
          insertGame.run(season, week, shuffled[i * 2], shuffled[i * 2 + 1]);
        }
      }
    });
    create();
    return { season, created: true, alreadyExists: false };
  });

  ipcMain.handle('get-current-week', () => {
    const season = getCurrentSeason();
    if (gameRepo.countBySeason(season) === 0) return { hasSchedule: false, currentWeek: null };
    return { hasSchedule: true, currentWeek: gameRepo.getCurrentWeek(season) };
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
    const games = gameRepo.getPendingByWeek(season, week);
    if (games.length === 0) return { week, season, gamesSimulated: 0 };

    playerRepo.advanceInjuryTimers();

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
    const userTeamId = settingsRepo.getUserTeamId() ?? -1;

    const runWeek = db.transaction(() => {
      for (const game of games) {
        const result = simulateGame(game.home_team_id, game.away_team_id, game.week ?? 1, userTeamId, getDifficultyFactor());
        gameRepo.updateResult(game.id, result.homeScore, result.awayScore, result.homeQuarters, result.awayQuarters, result.weather ?? 'clear');
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
    const userTeamId = settingsRepo.getUserTeamId() ?? -1;

    const runGame = db.transaction(() => {
      gameResult = simulateGame(game.home_team_id, game.away_team_id, game.week ?? 1, userTeamId, getDifficultyFactor());
      gameRepo.updateResult(game.id, gameResult.homeScore, gameResult.awayScore, gameResult.homeQuarters, gameResult.awayQuarters, gameResult.weather ?? 'clear');
      for (const stat of [...gameResult.homePlayerStats, ...gameResult.awayPlayerStats]) {
        insertStat.run({ game_id: game.id, ...stat });
        allStats.push(stat);
      }
    });
    runGame();

    const weekComplete = gameRepo.countPendingInWeek(game.season, game.week) === 0;
    const newlyInjured = rollInjuries(allStats);
    const rosterResult = processRosterAdjustments(newlyInjured, userTeamId);

    if (weekComplete) {
      playerRepo.advanceInjuryTimers();
      processWaivers(userTeamId, game.week);
    }

    return {
      success: true, gameId, weekComplete,
      homeScore: gameResult.homeScore, awayScore: gameResult.awayScore,
      callups: rosterResult.callups, userPSOpenSpots: rosterResult.userPSOpenSpots,
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
        const { wins, losses } = gameRepo.getTeamRecord(t.id, season);
        return { ...t, wins, losses, team_name: `${t.city} ${t.name}` };
      }).sort((a: any, b: any) => b.wins - a.wins).slice(0, 7);
    };
    return { afc: getConferenceSeeds('AFC'), nfc: getConferenceSeeds('NFC') };
  });
}
