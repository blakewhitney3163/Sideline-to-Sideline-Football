import { ipcMain } from 'electron';
const { db } = require('../database');
import { getCurrentSeason } from '../helpers/getCurrentSeason';
import { calcFairMarket } from './contractHandlers';
import { HOF_MIN_GAMES, HOF_THRESHOLDS } from '../constants';
import { AdvanceSeasonResult } from '../types';

// ─── HOF Eligibility ──────────────────────────────────────────────────────────

function isHOFEligible(position: string, career: any): boolean {
  if ((career.games ?? 0) < HOF_MIN_GAMES) return false;
  const thresholds = HOF_THRESHOLDS[position];
  if (!thresholds) return false;
  return thresholds.some(t => (parseFloat(career[t.stat]) || 0) >= t.value);
}

// ─── Register Handlers ────────────────────────────────────────────────────────

export function registerSeasonHandlers(): void {

  ipcMain.handle('get-standings', (_event: any, season?: number) => {
    const s = season ?? getCurrentSeason();
    const teams = db.prepare('SELECT id, city, name, conference, division FROM teams').all();
    return teams.map((team: any) => {
      const wins = db.prepare(`SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND is_playoff = 0 AND ((home_team_id = ? AND home_score > away_score) OR (away_team_id = ? AND away_score > home_score))`).get(s, team.id, team.id).count;
      const losses = db.prepare(`SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND is_playoff = 0 AND ((home_team_id = ? AND home_score < away_score) OR (away_team_id = ? AND away_score < home_score))`).get(s, team.id, team.id).count;
      const ties = db.prepare(`SELECT COUNT(*) as count FROM games WHERE season = ? AND is_simulated = 1 AND is_playoff = 0 AND (home_team_id = ? OR away_team_id = ?) AND home_score = away_score`).get(s, team.id, team.id).count;
      return { ...team, wins, losses, ties };
    });
  });

  ipcMain.handle('get-teams', () => {
    return db.prepare('SELECT * FROM teams ORDER BY conference, division, name').all();
  });

  ipcMain.handle('get-roster', (_event: any, teamId: number) => {
    return db.prepare(`
      SELECT id, first_name, last_name, position, position_label, overall_rating, age,
        speed, strength, awareness, dev_trait,
        throw_accuracy, throw_power, catching, route_running,
        tackle_rating, coverage, pass_rush
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
    return [...live, ...history.filter((r: any) => !liveSeasons.has(r.season))].sort((a: any, b: any) => b.season - a.season);
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
    const passing = db.prepare(`SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name, p.overall_rating, p.age, p.position, p.dev_trait, t.city || ' ' || t.name AS team_name, SUM(st.pass_yards) AS pass_yards, SUM(st.pass_tds) AS pass_tds, SUM(st.interceptions) AS interceptions, SUM(st.completions) AS completions, SUM(st.pass_attempts) AS pass_attempts FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id WHERE g.season = ? AND g.is_simulated = 1 AND st.pass_attempts > 0 GROUP BY p.id ORDER BY pass_yards DESC LIMIT 15`).all(s);
    const rushing = db.prepare(`SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name, p.overall_rating, p.age, p.position, p.dev_trait, t.city || ' ' || t.name AS team_name, SUM(st.rush_yards) AS rush_yards, SUM(st.rush_tds) AS rush_tds, SUM(st.rush_attempts) AS rush_attempts FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id WHERE g.season = ? AND g.is_simulated = 1 AND st.rush_attempts > 0 GROUP BY p.id ORDER BY rush_yards DESC LIMIT 15`).all(s);
    const receiving = db.prepare(`SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name, p.overall_rating, p.age, p.position, p.dev_trait, t.city || ' ' || t.name AS team_name, SUM(st.rec_yards) AS rec_yards, SUM(st.rec_tds) AS rec_tds, SUM(st.receptions) AS receptions, SUM(st.targets) AS targets FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id WHERE g.season = ? AND g.is_simulated = 1 AND st.targets > 0 GROUP BY p.id ORDER BY rec_yards DESC LIMIT 15`).all(s);
    const tackles = db.prepare(`SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name, p.overall_rating, p.age, p.position, p.dev_trait, t.city || ' ' || t.name AS team_name, SUM(st.tackles) AS tackles, SUM(st.assisted_tackles) AS assisted_tackles, SUM(st.sacks) AS sacks, SUM(st.tfl) AS tfl, SUM(st.forced_fumbles) AS forced_fumbles FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id WHERE g.season = ? AND g.is_simulated = 1 AND st.tackles > 0 GROUP BY p.id ORDER BY tackles DESC LIMIT 15`).all(s);
    const sacks = db.prepare(`SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name, p.overall_rating, p.age, p.position, p.dev_trait, t.city || ' ' || t.name AS team_name, SUM(st.sacks) AS sacks, SUM(st.tfl) AS tfl, SUM(st.forced_fumbles) AS forced_fumbles, SUM(st.tackles) AS tackles FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id WHERE g.season = ? AND g.is_simulated = 1 AND st.sacks > 0 GROUP BY p.id ORDER BY sacks DESC LIMIT 15`).all(s);
    const defInterceptions = db.prepare(`SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name, p.overall_rating, p.age, p.position, p.dev_trait, t.city || ' ' || t.name AS team_name, SUM(st.def_interceptions) AS def_interceptions, SUM(st.pass_deflections) AS pass_deflections, SUM(st.def_tds) AS def_tds, SUM(st.tackles) AS tackles FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id JOIN games g ON st.game_id = g.id WHERE g.season = ? AND g.is_simulated = 1 AND (st.def_interceptions > 0 OR st.pass_deflections > 0) GROUP BY p.id ORDER BY def_interceptions DESC, pass_deflections DESC LIMIT 15`).all(s);
    return { passing, rushing, receiving, tackles, sacks, defInterceptions };
  });

  ipcMain.handle('get-hall-of-fame', () => {
    return db.prepare('SELECT * FROM hall_of_fame ORDER BY inducted_season DESC, name ASC').all();
  });

  ipcMain.handle('get-team-season-stats', (_event: any, season?: number) => {
    const s = season ?? getCurrentSeason();
    const pointRows = db.prepare(`
      SELECT t.id, t.city, t.name,
        COUNT(g.id) as games,
        SUM(CASE WHEN g.home_team_id = t.id THEN g.home_score ELSE g.away_score END) as points_for,
        SUM(CASE WHEN g.home_team_id = t.id THEN g.away_score ELSE g.home_score END) as points_against,
        SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score) OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score) OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0 END) as losses
      FROM teams t
      JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
      WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
      GROUP BY t.id
    `).all(s) as any[];
    const statRows = db.prepare(`
      SELECT s.team_id,
        SUM(s.pass_yards + s.rush_yards) as off_yards,
        SUM(s.interceptions) as turnovers_given,
        SUM(s.def_interceptions + COALESCE(s.fumble_recoveries, 0)) as turnovers_taken
      FROM stats s JOIN games g ON s.game_id = g.id
      WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
      GROUP BY s.team_id
    `).all(s) as any[];
    return pointRows.map((t: any) => {
      const st = statRows.find((r: any) => r.team_id === t.id) ?? {};
      const g = Math.max(t.games, 1);
      return {
        ...t,
        ppg: Math.round((t.points_for / g) * 10) / 10,
        papg: Math.round((t.points_against / g) * 10) / 10,
        ypg: Math.round((st.off_yards ?? 0) / g),
        to_diff: (st.turnovers_taken ?? 0) - (st.turnovers_given ?? 0),
        to_given: st.turnovers_given ?? 0,
        to_taken: st.turnovers_taken ?? 0,
      };
    }).sort((a: any, b: any) => b.ppg - a.ppg);
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

  ipcMain.handle('advance-season', async (): Promise<AdvanceSeasonResult> => {
    const current = getCurrentSeason();
    const next = current + 1;

    db.prepare("UPDATE players SET age = age + 1 WHERE roster_status != 'retired'").run();

    const players = db.prepare(
      `SELECT id, age, overall_rating, speed, strength, awareness, dev_trait, position,
      throw_accuracy, throw_power, catching, route_running, tackle_rating, coverage, pass_rush
      FROM players WHERE roster_status != 'retired'`
    ).all() as any[];

    const progressionTable: Record<string, Record<string, [number, number]>> = {
      young:   { Normal: [0, 1],  Star: [1, 2],  Superstar: [2, 3],  'X-Factor': [3, 4] },
      rising:  { Normal: [0, 1],  Star: [0, 2],  Superstar: [1, 2],  'X-Factor': [2, 3] },
      prime:   { Normal: [-1, 0], Star: [0, 1],  Superstar: [0, 1],  'X-Factor': [0, 1] },
      decline: { Normal: [-2,-1], Star: [-1, 0], Superstar: [-1, 0], 'X-Factor': [-1, 0] },
      old:     { Normal: [-3,-2], Star: [-2,-1], Superstar: [-2,-1], 'X-Factor': [-1, 0] },
      veteran: { Normal: [-4,-3], Star: [-3,-2], Superstar: [-3,-2], 'X-Factor': [-2,-1] },
    };

    const updatePlayer = db.prepare(`
      UPDATE players SET overall_rating = ?, speed = ?, strength = ?, awareness = ?,
        throw_accuracy = ?, throw_power = ?, catching = ?, route_running = ?,
        tackle_rating = ?, coverage = ?, pass_rush = ?
      WHERE id = ?
    `);
    const attr = (cur: number, growP: number, decP: number, amt = 1): number => {
      const r = Math.random();
      if (r < growP) return Math.min(99, cur + amt);
      if (r < growP + decP) return Math.max(40, cur - amt);
      return cur;
    };
    const progressPlayers = db.transaction(() => {
      for (const p of players) {
        const trait = p.dev_trait ?? 'Normal';
        const bracket =
          p.age <= 23 ? 'young' : p.age <= 26 ? 'rising' : p.age <= 29 ? 'prime' :
          p.age <= 32 ? 'decline' : p.age <= 35 ? 'old' : 'veteran';
        const [min, max] = progressionTable[bracket][trait] ?? [0, 0];
        const ovrChange = Math.floor(Math.random() * (max - min + 1)) + min;
        const newOvr = Math.max(40, Math.min(99, p.overall_rating + ovrChange));
        const isYoung = p.age <= 26;
        const isOld = p.age >= 32;
        const pos = p.position;
        const isRecvr = ['WR', 'TE', 'RB', 'HB', 'FB'].includes(pos);
        const isDef = ['DL', 'DE', 'DT', 'LE', 'RE', 'IDL', 'LB', 'MLB', 'OLB', 'CB', 'S', 'FS', 'SS'].includes(pos);
        updatePlayer.run(
          newOvr,
          attr(p.speed ?? 70, isYoung ? 0.20 : 0.03, p.age >= 34 ? 0.70 : p.age >= 31 ? 0.40 : p.age >= 29 ? 0.15 : 0.03),
          attr(p.strength ?? 70, p.age <= 25 ? 0.35 : 0.05, isOld ? 0.30 : 0.05),
          attr(p.awareness ?? 70, isYoung ? 0.35 : p.age <= 31 ? 0.15 : 0.05, p.age >= 35 ? 0.30 : 0.05),
          attr(p.throw_accuracy ?? 70, isYoung && pos === 'QB' ? 0.40 : 0.03, isOld ? 0.25 : 0.04),
          attr(p.throw_power ?? 70, isYoung && pos === 'QB' ? 0.25 : 0.02, isOld ? 0.30 : 0.05),
          attr(p.catching ?? 70, isYoung && isRecvr ? 0.35 : 0.04, isOld ? 0.25 : 0.04),
          attr(p.route_running ?? 70, isYoung && ['WR', 'TE'].includes(pos) ? 0.35 : 0.03, isOld ? 0.20 : 0.04),
          attr(p.tackle_rating ?? 70, isYoung && isDef ? 0.30 : 0.04, isOld ? 0.25 : 0.05),
          attr(p.coverage ?? 70, isYoung && ['CB', 'S', 'FS', 'SS', 'LB', 'MLB', 'OLB'].includes(pos) ? 0.30 : 0.04, isOld ? 0.25 : 0.05),
          attr(p.pass_rush ?? 70, isYoung && ['DL', 'DE', 'DT', 'LE', 'RE', 'IDL', 'LB', 'OLB'].includes(pos) ? 0.30 : 0.04, isOld ? 0.25 : 0.05),
          p.id
        );
      }
    });
    progressPlayers();

    const breakoutIds = new Set<number>();
    const breakoutStats = db.prepare(`
      SELECT s.player_id, p.age, p.position,
        SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds,
        SUM(s.rush_yards) as rush_yards, SUM(s.rec_yards) as rec_yards,
        SUM(s.sacks) as sacks, SUM(s.def_interceptions) as def_int,
        SUM(s.tackles) + SUM(s.assisted_tackles) as total_tkl
      FROM stats s JOIN games g ON s.game_id = g.id JOIN players p ON s.player_id = p.id
      WHERE g.season = ? AND g.is_simulated = 1
      GROUP BY s.player_id
    `).all(current) as any[];

    for (const row of breakoutStats) {
      const isBreakout =
        (row.position === 'QB' && (row.pass_yards > 4000 || row.pass_tds > 30)) ||
        (['RB','HB','FB'].includes(row.position) && row.rush_yards > 1300) ||
        (['WR','TE'].includes(row.position) && row.rec_yards > 1100) ||
        (row.sacks > 10) || (row.def_int > 5) || (row.total_tkl > 130);
      if (isBreakout && row.age <= 28) breakoutIds.add(row.player_id);
    }

    if (breakoutIds.size > 0) {
      const applyBreakout = db.transaction(() => {
        for (const pid of breakoutIds) {
          const pp = db.prepare('SELECT age FROM players WHERE id = ?').get(pid) as any;
          const bonus = pp && pp.age <= 24 ? 2 : 1;
          db.prepare('UPDATE players SET overall_rating = MIN(99, overall_rating + ?) WHERE id = ?').run(bonus, pid);
        }
      });
      applyBreakout();
    }

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

    const retireCandidates = db.prepare(
      "SELECT id, first_name, last_name, position, age, overall_rating FROM players WHERE age >= 33 AND roster_status != 'retired'"
    ).all() as any[];

    const retired: { id: number; name: string; position: string; age: number; ovr: number }[] = [];
    const retirePlayers = db.transaction(() => {
      for (const p of retireCandidates) {
        let chance = p.age >= 40 ? 0.95 : p.age >= 38 ? 0.75 : p.age >= 36 ? 0.40 : p.age >= 34 ? 0.18 : 0.07;
        if (p.overall_rating < 72) chance = Math.min(0.95, chance * 1.5);
        if (Math.random() < chance) {
          db.prepare("UPDATE players SET roster_status = 'retired', team_id = NULL, is_free_agent = 0 WHERE id = ?").run(p.id);
          db.prepare('DELETE FROM contracts WHERE player_id = ?').run(p.id);
          retired.push({ id: p.id, name: `${p.first_name} ${p.last_name}`, position: p.position, age: p.age, ovr: p.overall_rating });
        }
      }
    });
    retirePlayers();

    const userTeamIdRow = db.prepare("SELECT value FROM settings WHERE key = 'user_team_id'").get() as any;
    const userTeamId = userTeamIdRow ? parseInt(userTeamIdRow.value) : -1;

    const expiringCpuPlayers = db.prepare(`
      SELECT p.id, p.overall_rating, p.age, p.position, p.dev_trait, c.team_id
      FROM contracts c JOIN players p ON c.player_id = p.id
      WHERE c.years_remaining = 1 AND c.team_id != ? AND p.roster_status = 'active'
    `).all(userTeamId) as any[];

    let cpuResigns = 0;
    const doResigns = db.transaction(() => {
      for (const p of expiringCpuPlayers) {
        const resignChance =
          p.overall_rating >= 88 ? 0.90 : p.overall_rating >= 82 ? 0.80 :
          p.overall_rating >= 75 ? 0.65 : p.overall_rating >= 70 ? 0.40 : 0.20;
        if (Math.random() < resignChance) {
          const fair = calcFairMarket(p.overall_rating, p.position, p.dev_trait);
          const salary = Math.round(fair * (1.0 + Math.random() * 0.10) * 10) / 10;
          const years = p.age <= 26 ? 3 : p.age <= 30 ? 2 : 1;
          db.prepare('UPDATE contracts SET years_total = ?, years_remaining = ?, annual_salary = ? WHERE player_id = ?')
            .run(years, years, salary, p.id);
          cpuResigns++;
        }
      }
    });
    doResigns();

    db.prepare('UPDATE contracts SET years_remaining = years_remaining - 1').run();
    const expiredPlayers = db.prepare('SELECT player_id FROM contracts WHERE years_remaining <= 0').all() as any[];
    const expireContracts = db.transaction(() => {
      for (const { player_id } of expiredPlayers) {
        db.prepare('DELETE FROM contracts WHERE player_id = ?').run(player_id);
        db.prepare("UPDATE players SET team_id = NULL, is_free_agent = 1, roster_status = 'free_agent' WHERE id = ?").run(player_id);
      }
    });
    expireContracts();

    db.prepare("UPDATE players SET injury_status = 'healthy', weeks_out = 0, injury_type = NULL").run();
    db.prepare("UPDATE players SET roster_status = 'free_agent', is_free_agent = 1 WHERE roster_status = 'waivers'").run();

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
        games = excluded.games, completions = excluded.completions,
        pass_attempts = excluded.pass_attempts, pass_yards = excluded.pass_yards,
        pass_tds = excluded.pass_tds, interceptions = excluded.interceptions,
        rush_attempts = excluded.rush_attempts, rush_yards = excluded.rush_yards,
        rush_tds = excluded.rush_tds, targets = excluded.targets,
        receptions = excluded.receptions, rec_yards = excluded.rec_yards,
        rec_tds = excluded.rec_tds, tackles = excluded.tackles,
        assisted_tackles = excluded.assisted_tackles, sacks = excluded.sacks,
        tfl = excluded.tfl, forced_fumbles = excluded.forced_fumbles,
        fumble_recoveries = excluded.fumble_recoveries,
        def_interceptions = excluded.def_interceptions,
        pass_deflections = excluded.pass_deflections, def_tds = excluded.def_tds
    `).run(current);

    const hofInductees: { name: string; position: string }[] = [];
    const runHof = db.transaction(() => {
      for (const r of retired) {
        if (db.prepare('SELECT id FROM hall_of_fame WHERE player_id = ?').get(r.id)) continue;
        const detail = db.prepare('SELECT dev_trait FROM players WHERE id = ?').get(r.id) as any;
        const career = db.prepare(`
          SELECT SUM(games) as games,
            SUM(pass_yards) as pass_yards, SUM(pass_tds) as pass_tds,
            SUM(rush_yards) as rush_yards, SUM(rush_tds) as rush_tds,
            SUM(rec_yards) as rec_yards, SUM(rec_tds) as rec_tds, SUM(receptions) as receptions,
            SUM(tackles) as tackles, SUM(CAST(sacks AS REAL)) as sacks,
            SUM(def_interceptions) as def_interceptions, SUM(pass_deflections) as pass_deflections
          FROM career_stats_history WHERE player_id = ?
        `).get(r.id) as any;
        if (!career?.games || !isHOFEligible(r.position, career)) continue;
        db.prepare(`INSERT OR IGNORE INTO hall_of_fame (
          player_id, name, position, inducted_season, dev_trait, peak_ovr,
          career_games, career_pass_yards, career_pass_tds,
          career_rush_yards, career_rush_tds,
          career_rec_yards, career_rec_tds, career_receptions,
          career_tackles, career_sacks, career_def_ints, career_pass_deflections
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(r.id, r.name, r.position, next,
            detail?.dev_trait ?? 'Normal', r.ovr,
            career.games ?? 0, career.pass_yards ?? 0, career.pass_tds ?? 0,
            career.rush_yards ?? 0, career.rush_tds ?? 0,
            career.rec_yards ?? 0, career.rec_tds ?? 0, career.receptions ?? 0,
            career.tackles ?? 0, career.sacks ?? 0,
            career.def_interceptions ?? 0, career.pass_deflections ?? 0);
        hofInductees.push({ name: r.name, position: r.position });
      }
    });
    runHof();

    db.prepare("UPDATE settings SET value = ? WHERE key = 'current_season'").run(String(next));
    return { nextSeason: next, retired, cpuResigns, breakouts: breakoutIds.size, hofInductees };
  });
}
