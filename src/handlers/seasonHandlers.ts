import { ipcMain } from 'electron';
import { db } from '../database';
import { getCurrentSeason } from '../helpers/getCurrentSeason';
import { AdvanceSeasonResult } from '../types';
import { settingsRepo, gameRepo } from '../repositories';
import { advanceSeason } from '../services/SeasonService';

export function registerSeasonHandlers(): void {

  ipcMain.handle('get-standings', (_event: any, season?: number) => {
    const s = season ?? getCurrentSeason();
    return (db.prepare('SELECT id, city, name, conference, division FROM teams').all() as any[])
      .map((team: any) => { const r = gameRepo.getTeamRecord(team.id, s); return { ...team, wins: r.wins, losses: r.losses, ties: r.ties }; });
  });

  ipcMain.handle('get-teams', () =>
    db.prepare('SELECT * FROM teams ORDER BY conference, division, name').all());

  ipcMain.handle('get-roster', (_event: any, teamId: number) =>
    db.prepare(`SELECT id, first_name, last_name, position, position_label, overall_rating, age, speed, strength, awareness, dev_trait, throw_accuracy, throw_power, catching, route_running, tackle_rating, coverage, pass_rush FROM players WHERE team_id = ? ORDER BY CASE position WHEN 'QB' THEN 1 WHEN 'RB' THEN 2 WHEN 'WR' THEN 3 WHEN 'TE' THEN 4 WHEN 'OL' THEN 5 WHEN 'DL' THEN 6 WHEN 'LB' THEN 7 WHEN 'CB' THEN 8 WHEN 'S' THEN 9 WHEN 'K' THEN 10 ELSE 11 END, overall_rating DESC`).all(teamId));

  ipcMain.handle('get-player-stats', (_event: any, playerId: number) => {
    const season = getCurrentSeason();
    return db.prepare(`SELECT COUNT(DISTINCT s.game_id) as games, SUM(s.pass_attempts) as pass_attempts, SUM(s.completions) as completions, SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds, SUM(s.interceptions) as interceptions, SUM(s.rush_attempts) as rush_attempts, SUM(s.rush_yards) as rush_yards, SUM(s.rush_tds) as rush_tds, SUM(s.targets) as targets, SUM(s.receptions) as receptions, SUM(s.rec_yards) as rec_yards, SUM(s.rec_tds) as rec_tds, SUM(s.tackles) as tackles, SUM(s.assisted_tackles) as assisted_tackles, SUM(s.sacks) as sacks, SUM(s.tfl) as tfl, SUM(s.def_interceptions) as def_interceptions, SUM(s.pass_deflections) as pass_deflections FROM stats s JOIN games g ON s.game_id = g.id WHERE s.player_id = ? AND g.season = ?`).get(playerId, season);
  });

  ipcMain.handle('get-player-career-stats', (_event: any, playerId: number) => {
    const live = db.prepare(`SELECT g.season, COUNT(DISTINCT s.game_id) as games, SUM(s.completions) as completions, SUM(s.pass_attempts) as pass_attempts, SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds, SUM(s.interceptions) as interceptions, SUM(s.rush_attempts) as rush_attempts, SUM(s.rush_yards) as rush_yards, SUM(s.rush_tds) as rush_tds, SUM(s.targets) as targets, SUM(s.receptions) as receptions, SUM(s.rec_yards) as rec_yards, SUM(s.rec_tds) as rec_tds, SUM(s.tackles) as tackles, SUM(s.assisted_tackles) as assisted_tackles, SUM(s.sacks) as sacks, SUM(s.tfl) as tfl, SUM(s.def_interceptions) as def_interceptions, SUM(s.pass_deflections) as pass_deflections FROM stats s JOIN games g ON s.game_id = g.id WHERE s.player_id = ? GROUP BY g.season`).all(playerId) as any[];
    const history = db.prepare(`SELECT season, games, completions, pass_attempts, pass_yards, pass_tds, interceptions, rush_attempts, rush_yards, rush_tds, targets, receptions, rec_yards, rec_tds, tackles, assisted_tackles, sacks, tfl, def_interceptions, pass_deflections FROM career_stats_history WHERE player_id = ?`).all(playerId) as any[];
    const liveSeasons = new Set(live.map((r: any) => r.season));
    return [...live, ...history.filter((r: any) => !liveSeasons.has(r.season))].sort((a: any, b: any) => b.season - a.season);
  });

  ipcMain.handle('get-schedule', (_event: any, season?: number) => {
    const s = season ?? getCurrentSeason();
    return db.prepare(`SELECT g.id, g.week, g.home_score, g.away_score, ht.city || ' ' || ht.name AS home_team, at.city || ' ' || at.name AS away_team FROM games g JOIN teams ht ON g.home_team_id = ht.id JOIN teams at ON g.away_team_id = at.id WHERE g.season = ? AND g.is_simulated = 1 ORDER BY g.week, g.id`).all(s);
  });

  ipcMain.handle('get-dashboard', (_event: any, season?: number) => {
    const s = season ?? getCurrentSeason();
    const topAFC = db.prepare(`SELECT t.city || ' ' || t.name AS team_name, SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score) OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score) OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0 END) AS losses FROM teams t JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id) WHERE g.season = ? AND g.is_simulated = 1 AND t.conference = 'AFC' GROUP BY t.id ORDER BY wins DESC LIMIT 5`).all(s);
    const topNFC = db.prepare(`SELECT t.city || ' ' || t.name AS team_name, SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score) OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) AS wins, SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score) OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0 END) AS losses FROM teams t JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id) WHERE g.season = ? AND g.is_simulated = 1 AND t.conference = 'NFC' GROUP BY t.id ORDER BY wins DESC LIMIT 5`).all(s);
    const recentGames = db.prepare(`SELECT g.week, g.home_score, g.away_score, ht.city || ' ' || ht.name AS home_team, at.city || ' ' || at.name AS away_team FROM games g JOIN teams ht ON g.home_team_id = ht.id JOIN teams at ON g.away_team_id = at.id WHERE g.season = ? AND g.is_simulated = 1 ORDER BY g.week DESC, g.id DESC LIMIT 8`).all(s);
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
    const kickers = db.prepare(`
      SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
      p.overall_rating, p.age, p.position, p.dev_trait,
      t.city || ' ' || t.name AS team_name,
      SUM(st.fg_made) AS fg_made, SUM(st.fg_att) AS fg_att,
      SUM(st.xp_made) AS xp_made, SUM(st.xp_att) AS xp_att
      FROM stats st
      JOIN players p ON st.player_id = p.id
      JOIN teams t ON st.team_id = t.id
      JOIN games g ON st.game_id = g.id
      WHERE g.season = ? AND g.is_simulated = 1 AND st.fg_att > 0
      GROUP BY p.id ORDER BY fg_made DESC LIMIT 15
    `).all(s);
    return { passing, rushing, receiving, tackles, sacks, defInterceptions, kickers };
  });

  ipcMain.handle('get-hall-of-fame', () =>
    db.prepare('SELECT * FROM hall_of_fame ORDER BY inducted_season DESC, name ASC').all());

  ipcMain.handle('get-team-season-stats', (_event: any, season?: number) => {
    const s = season ?? getCurrentSeason();
    const pointRows = db.prepare(`SELECT t.id, t.city, t.name, COUNT(g.id) as games, SUM(CASE WHEN g.home_team_id = t.id THEN g.home_score ELSE g.away_score END) as points_for, SUM(CASE WHEN g.home_team_id = t.id THEN g.away_score ELSE g.home_score END) as points_against, SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score) OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) as wins, SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score) OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0 END) as losses FROM teams t JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id) WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0 GROUP BY t.id`).all(s) as any[];
    const statRows = db.prepare(`
      SELECT
        s.team_id,
        SUM(s.pass_yards)                                            AS pass_yards,
        SUM(s.rush_yards)                                            AS rush_yards,
        SUM(s.pass_yards + s.rush_yards)                             AS off_yards,
        SUM(s.pass_tds)                                              AS pass_tds,
        SUM(s.rush_tds)                                              AS rush_tds,
        SUM(s.pass_attempts)                                         AS pass_attempts,
        SUM(s.completions)                                           AS completions,
        SUM(s.rush_attempts)                                         AS rush_attempts,
        SUM(s.interceptions)                                         AS turnovers_given,
        SUM(s.def_interceptions + COALESCE(s.fumble_recoveries, 0)) AS turnovers_taken,
        SUM(COALESCE(s.sacks, 0))                                    AS sacks,
        SUM(COALESCE(s.def_interceptions, 0))                        AS def_ints,
        SUM(COALESCE(s.fg_made, 0))                                  AS fg_made,
        SUM(COALESCE(s.fg_att, 0))                                   AS fg_att,
        SUM(COALESCE(s.xp_made, 0))                                  AS xp_made,
        SUM(COALESCE(s.xp_att, 0))                                   AS xp_att
      FROM stats s
      JOIN games g ON s.game_id = g.id
      WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
      GROUP BY s.team_id
    `).all(s) as any[];
    return pointRows.map((t: any) => {
      const st = statRows.find((r: any) => r.team_id === t.id) ?? {};
      const g  = Math.max(t.games, 1);
      return {
        ...t,
        ppg:          Math.round((t.points_for     / g) * 10) / 10,
        papg:         Math.round((t.points_against / g) * 10) / 10,
        ypg:          Math.round((st.off_yards    ?? 0) / g),
        pass_ypg:     Math.round((st.pass_yards   ?? 0) / g),
        rush_ypg:     Math.round((st.rush_yards   ?? 0) / g),
        pass_tds:     st.pass_tds    ?? 0,
        rush_tds:     st.rush_tds    ?? 0,
        cmp_pct:      (st.pass_attempts ?? 0) > 0 ? Math.round(((st.completions ?? 0) / st.pass_attempts) * 100) : 0,
        rush_att_pg:  Math.round(((st.rush_attempts ?? 0) / g) * 10) / 10,
        sacks:        st.sacks       ?? 0,
        def_ints:     st.def_ints    ?? 0,
        to_diff:      (st.turnovers_taken ?? 0) - (st.turnovers_given ?? 0),
        to_given:     st.turnovers_given  ?? 0,
        to_taken:     st.turnovers_taken  ?? 0,
      };
    }).sort((a: any, b: any) => b.ppg - a.ppg);
  });

  ipcMain.handle('get-playoffs', (_event: any, season?: number) => {
    const s = season ?? getCurrentSeason();
    return db.prepare(`SELECT g.week, g.home_score, g.away_score, ht.city || ' ' || ht.name AS home_team, at.city || ' ' || at.name AS away_team FROM games g JOIN teams ht ON g.home_team_id = ht.id JOIN teams at ON g.away_team_id = at.id WHERE g.season = ? AND g.is_playoff = 1 ORDER BY g.week, g.id`).all(s);
  });

  ipcMain.handle('get-champions', () =>
    db.prepare(`SELECT c.season, t.city || ' ' || t.name AS team_name, t.conference FROM champions c JOIN teams t ON c.team_id = t.id ORDER BY c.season DESC`).all());

  ipcMain.handle('get-seasons', () =>
    (db.prepare(`SELECT DISTINCT season FROM games WHERE is_simulated = 1 ORDER BY season DESC`).all() as any[]).map((r: any) => r.season));

  ipcMain.handle('get-current-season', () => getCurrentSeason());

  ipcMain.handle('advance-season', async (): Promise<AdvanceSeasonResult> =>
    advanceSeason() as any);
}
