import { ipcMain } from 'electron';
import { db } from '../database';
import { POSITION_TO_GROUP } from '../constants';
import { getFranchiseRecords } from '../services/StatsService';

// ─── Depth Chart Helper ───────────────────────────────────────────────────────

function initDepthChart(teamId: number) {
  const hasOldGroups = (db.prepare(
    "SELECT COUNT(*) as cnt FROM depth_chart WHERE team_id = ? AND position_group IN ('OL','DL','LB')"
  ).get(teamId) as any).cnt > 0;
  if (hasOldGroups) {
    db.prepare('DELETE FROM depth_chart WHERE team_id = ?').run(teamId);
  }

  const existing = (db.prepare('SELECT COUNT(*) as count FROM depth_chart WHERE team_id = ?').get(teamId) as any).count;
  if (existing > 0) return;

  const players = db.prepare(`
    SELECT id, position, position_label FROM players
    WHERE team_id = ? AND roster_status = 'active'
    ORDER BY overall_rating DESC
  `).all(teamId) as any[];

  const insert = db.prepare('INSERT OR IGNORE INTO depth_chart (team_id, player_id, position_group, slot) VALUES (?, ?, ?, ?)');
  const groupSlots: Record<string, number> = {};
  db.transaction(() => {
    for (const p of players) {
      const pos = p.position_label || p.position;
      const group = POSITION_TO_GROUP[pos];
      if (!group) continue;
      groupSlots[group] = (groupSlots[group] ?? 0) + 1;
      insert.run(teamId, p.id, group, groupSlots[group]);
    }
  })();
}

// ─── Register Handlers ────────────────────────────────────────────────────────

export function registerStatsHandlers(): void {

  // ─── Depth Chart ───────────────────────────────────────────────────────────

  ipcMain.handle('get-depth-chart', (_event: any, teamId: number) => {
    initDepthChart(teamId);
    const rows = db.prepare(`
      SELECT dc.position_group, dc.slot, p.id as player_id, p.first_name, p.last_name,
        p.position, p.position_label, p.overall_rating, p.age, p.dev_trait,
        p.speed, p.strength, p.awareness,
        p.injury_status, p.weeks_out, p.injury_type
      FROM depth_chart dc
      JOIN players p ON dc.player_id = p.id
      WHERE dc.team_id = ?
      ORDER BY dc.position_group, dc.slot
    `).all(teamId) as any[];
    const grouped: Record<string, any[]> = {};
    for (const row of rows) {
      const g = row.position_group;
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(row);
    }
    return grouped;
  });

  ipcMain.handle('set-depth-chart-order', (_event: any, { teamId, positionGroup, playerIds }: {
    teamId: number; positionGroup: string; playerIds: number[];
  }) => {
    const update = db.prepare('UPDATE depth_chart SET slot = ? WHERE team_id = ? AND player_id = ? AND position_group = ?');
    db.transaction(() => {
      playerIds.forEach((pid, idx) => update.run(idx + 1, teamId, pid, positionGroup));
    })();
    return { success: true };
  });

  ipcMain.handle('reset-depth-chart', (_event: any, teamId: number) => {
    db.prepare('DELETE FROM depth_chart WHERE team_id = ?').run(teamId);
    initDepthChart(teamId);
    return { success: true };
  });

  // ─── Historical Records ────────────────────────────────────────────────────

  ipcMain.handle('get-alltime-leaders', () => {
    const historical = db.prepare(`
      SELECT category, player_name, team_display as team_name, position, games_played,
        pass_yards, pass_tds, interceptions, completions, pass_attempts,
        rush_yards, rush_tds, rush_attempts, rec_yards, rec_tds, receptions, 0 as targets,
        tackles, assisted_tackles, sacks, 0 as tfl, def_interceptions, pass_deflections, forced_fumbles,
        1 as is_historical, 0 as overall_rating, 'Normal' as dev_trait, 0 as player_id, NULL as age
      FROM historical_records WHERE record_type = 'alltime'
    `).all() as any[];

    const ingame = db.prepare(`
      SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
        t.name as team_name, p.overall_rating, p.age, p.position, p.dev_trait,
        SUM(h.games) as games_played,
        SUM(h.pass_yards) as pass_yards, SUM(h.pass_tds) as pass_tds, SUM(h.interceptions) as interceptions,
        SUM(h.completions) as completions, SUM(h.pass_attempts) as pass_attempts,
        SUM(h.rush_yards) as rush_yards, SUM(h.rush_tds) as rush_tds, SUM(h.rush_attempts) as rush_attempts,
        SUM(h.rec_yards) as rec_yards, SUM(h.rec_tds) as rec_tds, SUM(h.receptions) as receptions, 0 as targets,
        SUM(h.tackles) as tackles, SUM(h.assisted_tackles) as assisted_tackles,
        SUM(h.sacks) as sacks, 0 as tfl, SUM(h.def_interceptions) as def_interceptions,
        SUM(h.pass_deflections) as pass_deflections, SUM(h.forced_fumbles) as forced_fumbles,
        0 as is_historical
      FROM career_stats_history h
      JOIN players p ON h.player_id = p.id
      LEFT JOIN teams t ON p.team_id = t.id
      GROUP BY p.id
    `).all() as any[];

    const sortBy: Record<string, string> = {
      passing: 'pass_yards', rushing: 'rush_yards', receiving: 'rec_yards',
      tds: '_skill_tds', passTds: 'pass_tds',
      tackles: 'tackles', sacks: 'sacks', defInts: 'def_interceptions',
    };

    const result: any = {};
    for (const [cat, sortKey] of Object.entries(sortBy)) {
      const combined = [...historical.filter((r: any) => r.category === cat), ...ingame];
      result[cat] = combined.sort((a: any, b: any) => {
        const av = sortKey === '_skill_tds' ? ((a.rush_tds || 0) + (a.rec_tds || 0)) : (parseFloat(a[sortKey]) || 0);
        const bv = sortKey === '_skill_tds' ? ((b.rush_tds || 0) + (b.rec_tds || 0)) : (parseFloat(b[sortKey]) || 0);
        return bv - av;
      }).slice(0, 15);
    }
    return result;
  });

  ipcMain.handle('get-season-records', () => {
    const historical = db.prepare(`
      SELECT category, player_name, team_display as team_name, position, season, games_played,
        pass_yards, pass_tds, interceptions, completions, pass_attempts,
        rush_yards, rush_tds, rush_attempts, rec_yards, rec_tds, receptions, 0 as targets,
        tackles, assisted_tackles, sacks, 0 as tfl, def_interceptions, pass_deflections, forced_fumbles,
        1 as is_historical, 0 as overall_rating, 'Normal' as dev_trait, 0 as player_id, NULL as age
      FROM historical_records WHERE record_type = 'season'
    `).all() as any[];

    const ingame = db.prepare(`
      SELECT p.id as player_id, p.first_name || ' ' || p.last_name AS player_name,
        t.name as team_name, p.overall_rating, p.age, p.position, p.dev_trait,
        s.season, COUNT(DISTINCT s.game_id) as games_played,
        SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds, SUM(s.interceptions) as interceptions,
        SUM(s.completions) as completions, SUM(s.pass_attempts) as pass_attempts,
        SUM(s.rush_yards) as rush_yards, SUM(s.rush_tds) as rush_tds, SUM(s.rush_attempts) as rush_attempts,
        SUM(s.rec_yards) as rec_yards, SUM(s.rec_tds) as rec_tds, SUM(s.receptions) as receptions, 0 as targets,
        SUM(s.tackles) as tackles, SUM(s.assisted_tackles) as assisted_tackles,
        SUM(s.sacks) as sacks, 0 as tfl, SUM(s.def_interceptions) as def_interceptions,
        SUM(s.pass_deflections) as pass_deflections, SUM(s.forced_fumbles) as forced_fumbles,
        0 as is_historical
      FROM stats s
      JOIN players p ON s.player_id = p.id
      LEFT JOIN teams t ON p.team_id = t.id
      WHERE s.is_playoff = 0
      GROUP BY s.player_id, s.season
    `).all() as any[];

    const sortBy: Record<string, string> = {
      passing: 'pass_yards', rushing: 'rush_yards', receiving: 'rec_yards',
      tds: '_skill_tds', passTds: 'pass_tds',
      tackles: 'tackles', sacks: 'sacks', defInts: 'def_interceptions',
    };

    const result: any = {};
    for (const [cat, sortKey] of Object.entries(sortBy)) {
      const combined = [...historical.filter((r: any) => r.category === cat), ...ingame];
      result[cat] = combined.sort((a: any, b: any) => {
        const av = sortKey === '_skill_tds' ? ((a.rush_tds || 0) + (a.rec_tds || 0)) : (parseFloat(a[sortKey]) || 0);
        const bv = sortKey === '_skill_tds' ? ((b.rush_tds || 0) + (b.rec_tds || 0)) : (parseFloat(b[sortKey]) || 0);
        return bv - av;
      }).slice(0, 15);
    }
    return result;
  });

  ipcMain.handle('get-season-awards', (_event: any, season: number) => {
    const offStats = db.prepare(`
      SELECT p.id, p.first_name || ' ' || p.last_name as name,
        p.position, p.position_label, p.age, p.overall_rating, p.dev_trait,
        p.team_id, t.name as team_name, t.city as team_city,
        SUM(s.pass_yards) as pass_yards, SUM(s.pass_tds) as pass_tds,
        SUM(s.interceptions) as interceptions,
        SUM(s.rush_yards) as rush_yards, SUM(s.rush_tds) as rush_tds,
        SUM(s.rec_yards) as rec_yards, SUM(s.rec_tds) as rec_tds,
        SUM(s.receptions) as receptions,
        COUNT(DISTINCT s.game_id) as games
      FROM stats s
      JOIN players p ON s.player_id = p.id
      JOIN teams t ON p.team_id = t.id
      WHERE s.season = ? AND s.is_playoff = 0
      GROUP BY p.id HAVING games > 0
    `).all(season) as any[];

    const defStats = db.prepare(`
      SELECT p.id, p.first_name || ' ' || p.last_name as name,
        p.position, p.position_label, p.age, p.overall_rating, p.dev_trait,
        p.team_id, t.name as team_name, t.city as team_city,
        SUM(s.tackles) as tackles, SUM(s.assisted_tackles) as assisted_tackles,
        SUM(s.sacks) as sacks, SUM(s.def_interceptions) as def_interceptions,
        SUM(s.pass_deflections) as pass_deflections, SUM(s.forced_fumbles) as forced_fumbles,
        COUNT(DISTINCT s.game_id) as games
      FROM stats s
      JOIN players p ON s.player_id = p.id
      JOIN teams t ON p.team_id = t.id
      WHERE s.season = ? AND s.is_playoff = 0
      GROUP BY p.id HAVING games > 0
    `).all(season) as any[];

    const offScore = (p: any) =>
      (p.pass_yards || 0) * 0.04 + (p.pass_tds || 0) * 6 - (p.interceptions || 0) * 3 +
      (p.rush_yards || 0) * 0.1 + (p.rush_tds || 0) * 6 +
      (p.rec_yards || 0) * 0.1 + (p.rec_tds || 0) * 6;

    const defScore = (p: any) =>
      (p.tackles || 0) * 2 + (p.sacks || 0) * 10 +
      (p.def_interceptions || 0) * 8 + (p.pass_deflections || 0) * 2 +
      (p.forced_fumbles || 0) * 5;

    const OFF_POS = ['QB', 'RB', 'WR', 'TE'];
    const DEF_POS = ['DL', 'LB', 'CB', 'S'];

    const topOff = offStats.filter((p: any) => OFF_POS.includes(p.position))
      .sort((a: any, b: any) => offScore(b) - offScore(a));
    const topDef = defStats.filter((p: any) => DEF_POS.includes(p.position))
      .sort((a: any, b: any) => defScore(b) - defScore(a));

    const coyRow = db.prepare(`
      SELECT t.id, t.city, t.name,
        SUM(CASE WHEN (g.home_team_id = t.id AND g.home_score > g.away_score)
          OR (g.away_team_id = t.id AND g.away_score > g.home_score)
          THEN 1 ELSE 0 END) as wins
      FROM games g
      JOIN teams t ON g.home_team_id = t.id OR g.away_team_id = t.id
      WHERE g.season = ? AND g.is_playoff = 0 AND g.is_simulated = 1
      GROUP BY t.id ORDER BY wins DESC LIMIT 1
    `).get(season) as any;

    return {
      mvp:   topOff[0] || null,
      opoy:  topOff.find((p: any) => p.position !== 'QB') || null,
      dpoy:  topDef[0] || null,
      oroty: topOff.filter((p: any) => p.age <= 23)[0] || null,
      droty: topDef.filter((p: any) => p.age <= 23)[0] || null,
      coy:   coyRow || null,
    };
  });

  // ─── Franchise Records ─────────────────────────────────────────────────────

  ipcMain.handle('get-franchise-records', (_event: any, teamId: number) =>
    getFranchiseRecords(teamId));
}
