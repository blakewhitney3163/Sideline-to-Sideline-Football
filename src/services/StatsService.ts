import { db } from '../database';

export function getLeagueStats(season: number): {
  passing: any[]; rushing: any[]; receiving: any[];
  tackles: any[]; sacks: any[]; defInterceptions: any[]; kickers: any[];
} {
  const base = `FROM stats st JOIN players p ON st.player_id = p.id JOIN teams t ON st.team_id = t.id WHERE st.season = ? AND st.is_playoff = 0`;
  const sel = `p.id as player_id, p.first_name || ' ' || p.last_name AS player_name, p.overall_rating, p.age, p.position, p.dev_trait, t.city || ' ' || t.name AS team_name`;

  const passing        = db.prepare(`SELECT ${sel}, SUM(st.pass_yards) AS pass_yards, SUM(st.pass_tds) AS pass_tds, SUM(st.interceptions) AS interceptions, SUM(st.completions) AS completions, SUM(st.pass_attempts) AS pass_attempts ${base} AND st.pass_attempts > 0 GROUP BY p.id ORDER BY pass_yards DESC LIMIT 15`).all(season);
  const rushing        = db.prepare(`SELECT ${sel}, SUM(st.rush_yards) AS rush_yards, SUM(st.rush_tds) AS rush_tds, SUM(st.rush_attempts) AS rush_attempts ${base} AND st.rush_attempts > 0 GROUP BY p.id ORDER BY rush_yards DESC LIMIT 15`).all(season);
  const receiving      = db.prepare(`SELECT ${sel}, SUM(st.rec_yards) AS rec_yards, SUM(st.rec_tds) AS rec_tds, SUM(st.receptions) AS receptions, SUM(st.targets) AS targets ${base} AND st.targets > 0 GROUP BY p.id ORDER BY rec_yards DESC LIMIT 15`).all(season);
  const tackles        = db.prepare(`SELECT ${sel}, SUM(st.tackles) AS tackles, SUM(st.assisted_tackles) AS assisted_tackles, SUM(st.sacks) AS sacks, SUM(st.tfl) AS tfl, SUM(st.forced_fumbles) AS forced_fumbles ${base} AND st.tackles > 0 GROUP BY p.id ORDER BY tackles DESC LIMIT 15`).all(season);
  const sacks          = db.prepare(`SELECT ${sel}, SUM(st.sacks) AS sacks, SUM(st.tfl) AS tfl, SUM(st.forced_fumbles) AS forced_fumbles, SUM(st.tackles) AS tackles ${base} AND st.sacks > 0 GROUP BY p.id ORDER BY sacks DESC LIMIT 15`).all(season);
  const defInterceptions = db.prepare(`SELECT ${sel}, SUM(st.def_interceptions) AS def_interceptions, SUM(st.pass_deflections) AS pass_deflections, SUM(st.def_tds) AS def_tds, SUM(st.tackles) AS tackles ${base} AND (st.def_interceptions > 0 OR st.pass_deflections > 0) GROUP BY p.id ORDER BY def_interceptions DESC, pass_deflections DESC LIMIT 15`).all(season);
  const kickers        = db.prepare(`SELECT ${sel}, SUM(st.fg_made) AS fg_made, SUM(st.fg_att) AS fg_att, SUM(st.xp_made) AS xp_made, SUM(st.xp_att) AS xp_att ${base} AND st.fg_att > 0 GROUP BY p.id ORDER BY fg_made DESC LIMIT 15`).all(season);

  return { passing, rushing, receiving, tackles, sacks, defInterceptions, kickers };
}

export function getTeamSeasonStats(season: number): any[] {
  const pointRows = db.prepare(`
    SELECT t.id, t.city, t.name,
      COUNT(g.id) as games,
      SUM(CASE WHEN g.home_team_id = t.id THEN g.home_score ELSE g.away_score END) as points_for,
      SUM(CASE WHEN g.home_team_id = t.id THEN g.away_score ELSE g.home_score END) as points_against,
      SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score) OR (g.away_team_id = t.id AND g.away_score > g.home_score) THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score < g.away_score) OR (g.away_team_id = t.id AND g.away_score < g.home_score) THEN 1 ELSE 0 END) as losses
    FROM teams t JOIN games g ON (g.home_team_id = t.id OR g.away_team_id = t.id)
    WHERE g.season = ? AND g.is_simulated = 1 AND g.is_playoff = 0
    GROUP BY t.id
  `).all(season) as any[];

  const statRows = db.prepare(`
    SELECT s.team_id,
      SUM(s.pass_yards) AS pass_yards, SUM(s.rush_yards) AS rush_yards,
      SUM(s.pass_yards + s.rush_yards) AS off_yards,
      SUM(s.pass_tds) AS pass_tds, SUM(s.rush_tds) AS rush_tds,
      SUM(s.pass_attempts) AS pass_attempts, SUM(s.completions) AS completions,
      SUM(s.rush_attempts) AS rush_attempts,
      SUM(s.interceptions) AS turnovers_given,
      SUM(s.def_interceptions + COALESCE(s.fumble_recoveries, 0)) AS turnovers_taken,
      SUM(COALESCE(s.sacks, 0)) AS sacks,
      SUM(COALESCE(s.def_interceptions, 0)) AS def_ints,
      SUM(COALESCE(s.fg_made, 0)) AS fg_made, SUM(COALESCE(s.fg_att, 0)) AS fg_att,
      SUM(COALESCE(s.xp_made, 0)) AS xp_made, SUM(COALESCE(s.xp_att, 0)) AS xp_att
    FROM stats s
    WHERE s.season = ? AND s.is_playoff = 0
    GROUP BY s.team_id
  `).all(season) as any[];

  return pointRows.map((t: any) => {
    const st = statRows.find((r: any) => r.team_id === t.id) ?? {};
    const g = Math.max(t.games, 1);
    return {
      ...t,
      ppg: Math.round((t.points_for / g) * 10) / 10,
      papg: Math.round((t.points_against / g) * 10) / 10,
      ypg: Math.round((st.off_yards ?? 0) / g),
      pass_ypg: Math.round((st.pass_yards ?? 0) / g),
      rush_ypg: Math.round((st.rush_yards ?? 0) / g),
      pass_tds: st.pass_tds ?? 0, rush_tds: st.rush_tds ?? 0,
      cmp_pct: (st.pass_attempts ?? 0) > 0 ? Math.round(((st.completions ?? 0) / st.pass_attempts) * 100) : 0,
      rush_att_pg: Math.round(((st.rush_attempts ?? 0) / g) * 10) / 10,
      sacks: st.sacks ?? 0, def_ints: st.def_ints ?? 0,
      fg_made: st.fg_made ?? 0, fg_att: st.fg_att ?? 0,
      fg_pct: (st.fg_att ?? 0) > 0 ? Math.round(((st.fg_made ?? 0) / st.fg_att) * 100) : 0,
      xp_made: st.xp_made ?? 0, xp_att: st.xp_att ?? 0,
      to_diff: (st.turnovers_taken ?? 0) - (st.turnovers_given ?? 0),
      to_given: st.turnovers_given ?? 0, to_taken: st.turnovers_taken ?? 0,
    };
  }).sort((a: any, b: any) => b.ppg - a.ppg);
}

export function getTeamPlayerStats(teamId: number, season: number): any[] {
  return db.prepare(`
    SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
      p.overall_rating, p.age, p.position, p.dev_trait,
      t.city || ' ' || t.name AS team_name,
      SUM(st.pass_yards) AS pass_yards, SUM(st.pass_tds) AS pass_tds,
      SUM(st.interceptions) AS interceptions, SUM(st.completions) AS completions,
      SUM(st.pass_attempts) AS pass_attempts,
      SUM(st.rush_yards) AS rush_yards, SUM(st.rush_tds) AS rush_tds,
      SUM(st.rush_attempts) AS rush_attempts,
      SUM(st.rec_yards) AS rec_yards, SUM(st.rec_tds) AS rec_tds,
      SUM(st.receptions) AS receptions, SUM(st.targets) AS targets,
      SUM(st.tackles) AS tackles, SUM(st.assisted_tackles) AS assisted_tackles,
      SUM(st.sacks) AS sacks, SUM(st.tfl) AS tfl,
      SUM(st.forced_fumbles) AS forced_fumbles,
      SUM(st.def_interceptions) AS def_interceptions,
      SUM(st.pass_deflections) AS pass_deflections, SUM(st.def_tds) AS def_tds,
      SUM(st.fg_made) AS fg_made, SUM(st.fg_att) AS fg_att,
      SUM(st.xp_made) AS xp_made, SUM(st.xp_att) AS xp_att
    FROM stats st
    JOIN players p ON st.player_id = p.id
    JOIN teams t ON st.team_id = t.id
    WHERE st.season = ? AND st.is_playoff = 0 AND st.team_id = ?
    GROUP BY p.id
  `).all(season, teamId);
}
