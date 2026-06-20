import { ipcMain } from 'electron';
import { db } from '../database';
const pathModule = require('path');
const fsModule = require('fs');
import { POSITION_TO_GROUP } from '../constants';
import { getFranchiseRecords } from '../services/StatsService';

// ─── Depth Chart Helper ───────────────────────────────────────────────────────

function initDepthChart(teamId: number) {
  // Auto-migrate old flat OL/DL groups to specific position groups
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
      const sorted = combined.sort((a: any, b: any) => {
        const av = sortKey === '_skill_tds' ? ((a.rush_tds || 0) + (a.rec_tds || 0)) : (parseFloat(a[sortKey]) || 0);
        const bv = sortKey === '_skill_tds' ? ((b.rush_tds || 0) + (b.rec_tds || 0)) : (parseFloat(b[sortKey]) || 0);
        return bv - av;
      }).slice(0, 15);
      result[cat] = sorted;
    }
    return result;
  });

    ipcMain.handle('get-franchise-records', (_event: any, teamId: number) =>
    getFranchiseRecords(teamId));

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
      const sorted = combined.sort((a: any, b: any) => {
        const av = sortKey === '_skill_tds' ? ((a.rush_tds || 0) + (a.rec_tds || 0)) : (parseFloat(a[sortKey]) || 0);
        const bv = sortKey === '_skill_tds' ? ((b.rush_tds || 0) + (b.rec_tds || 0)) : (parseFloat(b[sortKey]) || 0);
        return bv - av;
      }).slice(0, 15);
      result[cat] = sorted;
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

    const offPlayers = offStats.filter((p: any) => OFF_POS.includes(p.position));
    const defPlayers = defStats.filter((p: any) => DEF_POS.includes(p.position));
    const topOff = [...offPlayers].sort((a: any, b: any) => offScore(b) - offScore(a));
    const topDef = [...defPlayers].sort((a: any, b: any) => defScore(b) - defScore(a));

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
      mvp: topOff[0] || null,
      opoy: topOff.find((p: any) => p.position !== 'QB') || null,
      dpoy: topDef[0] || null,
      oroty: topOff.filter((p: any) => p.age <= 23)[0] || null,
      droty: topDef.filter((p: any) => p.age <= 23)[0] || null,
      coy: coyRow || null,
    };
  });

  // ─── NFLverse Stats Import ──────────────────────────────────────────────────

  ipcMain.handle('import-nflverse-stats', () => {
    const csvPath = pathModule.join(process.cwd(), 'src', 'data', 'player-career-stats.csv');
    if (!fsModule.existsSync(csvPath)) {
      return { success: false, matched: 0, error: 'player-career-stats.csv not found — run scripts/fetch-career-stats.js first' };
    }

    const norm = (s: string) => s.toLowerCase().replace(/['\u2019.]/g, '').replace(/\s+/g, ' ').trim();
    const players = db.prepare('SELECT id, first_name, last_name FROM players').all() as any[];
    const byName: Record<string, any> = {};
    for (const p of players) byName[norm(`${p.first_name} ${p.last_name}`)] = p;

    const parseCSV = (filePath: string) => {
      const lines = fsModule.readFileSync(filePath, 'utf8').split('\n').filter((l: string) => l.trim());
      const headers = lines[0].split(',').map((h: string) => h.trim());
      return lines.slice(1).map((line: string) => {
        const vals: string[] = [];
        let cur = '', inQ = false;
        for (const ch of line) {
          if (ch === '"') { inQ = !inQ; }
          else if (ch === ',' && !inQ) { vals.push(cur); cur = ''; }
          else { cur += ch; }
        }
        vals.push(cur);
        const r: any = {};
        headers.forEach((h: string, i: number) => { r[h] = (vals[i] ?? '').trim(); });
        return r;
      });
    };

    const offRows = parseCSV(csvPath);
    const upsertOff = db.prepare(`
      INSERT OR IGNORE INTO career_stats_history
        (player_id, season, games,
        completions, pass_attempts, pass_yards, pass_tds, interceptions,
        rush_attempts, rush_yards, rush_tds,
        targets, receptions, rec_yards, rec_tds)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);

    let matched = 0, skipped = 0;
    const runOff = db.transaction(() => {
      for (const r of offRows) {
        const player = byName[norm(r.player_display_name ?? '')];
        if (!player) { skipped++; continue; }
        const season = parseInt(r.season);
        if (!season) { skipped++; continue; }
        upsertOff.run(
          player.id, season,
          parseInt(r.games) || 0,
          parseInt(r.completions) || 0,
          parseInt(r.attempts) || 0,
          parseInt(r.passing_yards) || 0,
          parseInt(r.passing_tds) || 0,
          parseInt(r.interceptions) || 0,
          parseInt(r.carries) || 0,
          parseInt(r.rushing_yards) || 0,
          parseInt(r.rushing_tds) || 0,
          parseInt(r.targets) || 0,
          parseInt(r.receptions) || 0,
          parseInt(r.receiving_yards) || 0,
          parseInt(r.receiving_tds) || 0,
        );
        matched++;
      }
    });
    runOff();

    const defCsvPath = pathModule.join(process.cwd(), 'src', 'data', 'player-career-stats-def.csv');
    let defMatched = 0;

    if (fsModule.existsSync(defCsvPath)) {
      const defRows = parseCSV(defCsvPath);
      const upsertDef = db.prepare(`
        INSERT INTO career_stats_history
          (player_id, season, games, tackles, assisted_tackles, sacks, tfl,
          forced_fumbles, def_interceptions, pass_deflections, def_tds)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(player_id, season) DO UPDATE SET
          tackles = excluded.tackles,
          assisted_tackles = excluded.assisted_tackles,
          sacks = excluded.sacks,
          tfl = excluded.tfl,
          forced_fumbles = excluded.forced_fumbles,
          def_interceptions = excluded.def_interceptions,
          pass_deflections = excluded.pass_deflections,
          def_tds = excluded.def_tds,
          games = MAX(career_stats_history.games, excluded.games)
      `);

      const runDef = db.transaction(() => {
        for (const r of defRows) {
          const player = byName[norm(r.player_display_name ?? '')];
          if (!player) continue;
          const season = parseInt(r.season);
          if (!season) continue;
          upsertDef.run(
            player.id, season,
            parseInt(r.games) || 0,
            parseFloat(r.tackles) || 0,
            parseFloat(r.assisted_tackles) || 0,
            parseFloat(r.sacks) || 0,
            parseFloat(r.tfl) || 0,
            parseFloat(r.forced_fumbles) || 0,
            parseFloat(r.def_interceptions) || 0,
            parseFloat(r.pass_deflections) || 0,
            parseFloat(r.def_tds) || 0,
          );
          defMatched++;
        }
      });
      runDef();
    }

    console.log(`Career stats: ${matched} offense matched, ${skipped} skipped, ${defMatched} defense matched`);
    return { success: true, matched: matched + defMatched, skipped };
  });
}
