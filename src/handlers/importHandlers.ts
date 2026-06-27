import { ipcMain, dialog } from 'electron';
import { db, generateContracts } from '../database';
import fs from 'fs';

// ─── CSV Utilities ────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const vals: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (ch === ',' && !inQ) {
      vals.push(cur.trim()); cur = '';
    } else {
      cur += ch;
    }
  }
  vals.push(cur.trim());
  return vals;
}

function parseFile(filePath: string): { headers: string[]; rows: Record<string, string>[] } | { error: string } {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
  if (lines.length < 2) return { error: 'CSV is empty or has no data rows' };
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(1)) {
    const vals = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i]?.trim() ?? ''; });
    rows.push(row);
  }
  return { headers, rows };
}

const col  = (r: Record<string, string>, k: string) => r[k] ?? '';
const iVal = (v: string) => parseInt(v)   || 0;
const fVal = (v: string) => parseFloat(v) || 0;

function devTraitForOvr(ovr: number): string {
  const r = Math.random();
  if (ovr >= 90) return r < 0.40 ? 'X-Factor' : r < 0.80 ? 'Superstar' : r < 0.98 ? 'Star' : 'Normal';
  if (ovr >= 80) return r < 0.05 ? 'X-Factor' : r < 0.30 ? 'Superstar' : r < 0.75 ? 'Star' : 'Normal';
  if (ovr >= 70) return r < 0.01 ? 'X-Factor' : r < 0.09 ? 'Superstar' : r < 0.44 ? 'Star' : 'Normal';
  return r < 0.002 ? 'X-Factor' : r < 0.022 ? 'Superstar' : r < 0.202 ? 'Star' : 'Normal';
}

// ─── Handler Registration ─────────────────────────────────────────────────────

export function registerImportHandlers(): void {

  // ── Historical Records ──────────────────────────────────────────────────────

  ipcMain.handle('import-historical-records', async (_event: any, recordType: 'alltime' | 'season') => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: recordType === 'alltime' ? 'Import All-Time Records CSV' : 'Import Season Records CSV',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) return { success: false, reason: 'Cancelled' };

    try {
      const parsed = parseFile(filePaths[0]);
      if ('error' in parsed) return { success: false, reason: parsed.error };
      const { rows } = parsed;

      const insert = db.prepare(`
        INSERT INTO historical_records
        (record_type, category, rank, player_name, team_display, position, season, games_played,
         pass_yards, pass_tds, interceptions, completions, pass_attempts,
         rush_yards, rush_tds, rush_attempts, rec_yards, rec_tds, receptions,
         tackles, assisted_tackles, sacks, def_interceptions, pass_deflections, forced_fumbles)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      db.prepare('DELETE FROM historical_records WHERE record_type = ?').run(recordType);

      let imported = 0;
      db.transaction(() => {
        for (const r of rows) {
          if (!col(r, 'player_name') || !col(r, 'category')) continue;
          const season = col(r, 'season') ? iVal(col(r, 'season')) : null;
          insert.run(
            recordType, col(r, 'category'), iVal(col(r, 'rank')),
            col(r, 'player_name'), col(r, 'team_display'), col(r, 'position'),
            season, iVal(col(r, 'games_played')),
            iVal(col(r, 'pass_yards')),    iVal(col(r, 'pass_tds')),
            iVal(col(r, 'interceptions')), iVal(col(r, 'completions')),
            iVal(col(r, 'pass_attempts')),
            iVal(col(r, 'rush_yards')),    iVal(col(r, 'rush_tds')),
            iVal(col(r, 'rush_attempts')),
            iVal(col(r, 'rec_yards')),     iVal(col(r, 'rec_tds')),
            iVal(col(r, 'receptions')),
            iVal(col(r, 'tackles')),       iVal(col(r, 'assisted_tackles')),
            fVal(col(r, 'sacks')),
            iVal(col(r, 'def_interceptions')),
            iVal(col(r, 'pass_deflections')),
            iVal(col(r, 'forced_fumbles'))
          );
          imported++;
        }
      })();

      return { success: true, imported };
    } catch (e: any) {
      return { success: false, reason: e.message ?? 'Unknown error' };
    }
  });

  // ── Custom Teams ────────────────────────────────────────────────────────────
  // Full dynasty reset — replaces teams, regenerates all players + contracts.

  ipcMain.handle('import-custom-teams', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import Custom Teams CSV',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) return { success: false, reason: 'Cancelled' };

    try {
      const parsed = parseFile(filePaths[0]);
      if ('error' in parsed) return { success: false, reason: parsed.error };
      const { headers, rows } = parsed;

      const REQUIRED = ['city', 'name', 'abbreviation', 'conference', 'division'];
      const missing = REQUIRED.filter(k => !headers.includes(k));
      if (missing.length) return { success: false, reason: `Missing required columns: ${missing.join(', ')}` };

      // Validate all rows before touching the DB
      const VALID_CONF = new Set(['AFC', 'NFC']);
      const VALID_DIV  = new Set(['North', 'South', 'East', 'West']);
      const seenAbbr   = new Set<string>();
      const errors: string[] = [];

      rows.forEach((r, idx) => {
        const line = idx + 2;
        if (!col(r, 'city'))         errors.push(`Row ${line}: city is required`);
        if (!col(r, 'name'))         errors.push(`Row ${line}: name is required`);
        const abbr = col(r, 'abbreviation').toUpperCase();
        if (!abbr)                    errors.push(`Row ${line}: abbreviation is required`);
        if (abbr && seenAbbr.has(abbr)) errors.push(`Row ${line}: duplicate abbreviation "${abbr}"`);
        if (abbr) seenAbbr.add(abbr);
        if (!VALID_CONF.has(col(r, 'conference').toUpperCase()))
          errors.push(`Row ${line}: conference must be AFC or NFC`);
        if (!VALID_DIV.has(col(r, 'division')))
          errors.push(`Row ${line}: division must be North, South, East, or West`);
      });

      if (errors.length) return { success: false, reason: errors.slice(0, 5).join(' | ') };

      // Clear all dynasty data (mirrors reset-save, plus teams + pick_assets)
      const CLEAR = [
        'stats', 'games', 'champions', 'contracts', 'depth_chart',
        'draft_prospects', 'career_stats_history', 'player_milestones',
        'hall_of_fame', 'news_events', 'players', 'pick_assets', 'teams',
      ];
      for (const table of CLEAR) db.prepare(`DELETE FROM ${table}`).run();
      db.prepare("UPDATE settings SET value = '2025' WHERE key = 'current_season'").run();
      db.prepare("DELETE FROM settings WHERE key = 'user_team_id'").run();

      // Insert teams from CSV
      const insertTeam = db.prepare(
        'INSERT INTO teams (city, name, abbreviation, conference, division) VALUES (?, ?, ?, ?, ?)'
      );
      db.transaction(() => {
        for (const r of rows) {
          insertTeam.run(
            col(r, 'city').trim(),
            col(r, 'name').trim(),
            col(r, 'abbreviation').toUpperCase().trim(),
            col(r, 'conference').toUpperCase().trim(),
            col(r, 'division').trim()
          );
        }
      })();

      // Regenerate players and contracts for the new team set
      const { generatePlayers } = require('../generatePlayers');
      generatePlayers();
      generateContracts();

      // Seed draft pick assets for current + next season
      const seasonRow = db.prepare("SELECT value FROM settings WHERE key = 'current_season'").get() as any;
      const season    = parseInt(seasonRow?.value ?? '2025');
      const allTeams  = db.prepare('SELECT id FROM teams').all() as { id: number }[];
      const insertPick = db.prepare(
        'INSERT OR IGNORE INTO pick_assets (owner_team_id, original_team_id, season, round) VALUES (?, ?, ?, ?)'
      );
      db.transaction(() => {
        for (const t of allTeams)
          for (let s = season; s <= season + 1; s++)
            for (let round = 1; round <= 7; round++)
              insertPick.run(t.id, t.id, s, round);
      })();

      return { success: true, imported: rows.length };
    } catch (e: any) {
      return { success: false, reason: e.message ?? 'Unknown error' };
    }
  });

  // ── Custom Players ──────────────────────────────────────────────────────────
  // Replaces all players + contracts. Teams remain unchanged.
  // If annual_salary + years_remaining columns are present, uses CSV values;
  // otherwise calls generateContracts() automatically.

  ipcMain.handle('import-custom-players', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import Custom Players CSV',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) return { success: false, reason: 'Cancelled' };

    try {
      const parsed = parseFile(filePaths[0]);
      if ('error' in parsed) return { success: false, reason: parsed.error };
      const { headers, rows } = parsed;

      const REQUIRED = ['first_name', 'last_name', 'position'];
      const missing = REQUIRED.filter(k => !headers.includes(k));
      if (missing.length) return { success: false, reason: `Missing required columns: ${missing.join(', ')}` };

      // Build team lookup (abbreviation → id) once — avoids per-row queries
      const teamRows = db.prepare('SELECT id, abbreviation FROM teams').all() as { id: number; abbreviation: string }[];
      const teamMap  = new Map<string, number>(teamRows.map(t => [t.abbreviation.toUpperCase(), t.id]));

      // Validate team references before clearing anything
      const FA_VALUES = new Set(['', 'FA', 'FREE_AGENT', 'FREE AGENT', 'N/A']);
      const errors: string[] = [];
      rows.forEach((r, idx) => {
        const abbr = col(r, 'team_abbreviation').toUpperCase().trim();
        if (!FA_VALUES.has(abbr) && !teamMap.has(abbr))
          errors.push(`Row ${idx + 2}: unknown team_abbreviation "${abbr}"`);
      });
      if (errors.length) return { success: false, reason: errors.slice(0, 5).join(' | ') };

      const hasSalary = headers.includes('annual_salary') && headers.includes('years_remaining');

      // Clear player-dependent tables (teams and game history remain)
      const CLEAR = ['contracts', 'depth_chart', 'career_stats_history', 'player_milestones', 'hall_of_fame', 'players'];
      for (const table of CLEAR) db.prepare(`DELETE FROM ${table}`).run();

      const insertPlayer = db.prepare(`
        INSERT INTO players (
          first_name, last_name, position, position_label, age, overall_rating,
          speed, strength, awareness, dev_trait,
          throw_accuracy, throw_power, catching, route_running,
          tackle_rating, coverage, pass_rush,
          kickpower, kickaccuracy, runblocking, passblocking,
          team_id, is_free_agent
        ) VALUES (
          @first_name, @last_name, @position, @position_label, @age, @overall_rating,
          @speed, @strength, @awareness, @dev_trait,
          @throw_accuracy, @throw_power, @catching, @route_running,
          @tackle_rating, @coverage, @pass_rush,
          @kickpower, @kickaccuracy, @runblocking, @passblocking,
          @team_id, @is_free_agent
        )
      `);

      // Prepared once outside the loop for efficiency
      const insertContract = hasSalary ? db.prepare(`
        INSERT INTO contracts (player_id, team_id, years_total, years_remaining, annual_salary)
        VALUES (@player_id, @team_id, @years_total, @years_remaining, @annual_salary)
      `) : null;

      const lastId = db.prepare('SELECT last_insert_rowid() as id');

      let imported = 0;
      db.transaction(() => {
        for (const r of rows) {
          const abbrRaw = col(r, 'team_abbreviation').toUpperCase().trim();
          const isFa    = FA_VALUES.has(abbrRaw) ? 1 : 0;
          const teamId  = isFa ? null : (teamMap.get(abbrRaw) ?? null);
          const ovr     = iVal(col(r, 'overall_rating')) || 72;

          // Use provided attribute or fall back to overall_rating
          const attr = (key: string) => { const v = iVal(col(r, key)); return v > 0 ? v : ovr; };

          insertPlayer.run({
            first_name:     col(r, 'first_name'),
            last_name:      col(r, 'last_name'),
            position:       col(r, 'position').toUpperCase(),
            position_label: col(r, 'position_label') || col(r, 'position').toUpperCase(),
            age:            iVal(col(r, 'age')) || 25,
            overall_rating: ovr,
            speed:          attr('speed'),
            strength:       attr('strength'),
            awareness:      attr('awareness'),
            dev_trait:      col(r, 'dev_trait') || devTraitForOvr(ovr),
            throw_accuracy: attr('throw_accuracy'),
            throw_power:    attr('throw_power'),
            catching:       attr('catching'),
            route_running:  attr('route_running'),
            tackle_rating:  attr('tackle_rating'),
            coverage:       attr('coverage'),
            pass_rush:      attr('pass_rush'),
            kickpower:      attr('kickpower'),
            kickaccuracy:   attr('kickaccuracy'),
            runblocking:    attr('runblocking'),
            passblocking:   attr('passblocking'),
            team_id:        teamId,
            is_free_agent:  isFa,
          });

          if (insertContract && !isFa && teamId !== null) {
            const playerId = (lastId.get() as any).id;
            const salary   = fVal(col(r, 'annual_salary')) || Math.round(ovr * 0.15 * 10) / 10;
            const years    = iVal(col(r, 'years_remaining')) || 2;
            insertContract.run({ player_id: playerId, team_id: teamId, years_total: years, years_remaining: years, annual_salary: salary });
          }

          imported++;
        }
      })();

      let contractsGenerated = false;
      if (!hasSalary) {
        generateContracts();
        contractsGenerated = true;
      }

      return { success: true, imported, contractsGenerated };
    } catch (e: any) {
      return { success: false, reason: e.message ?? 'Unknown error' };
    }
  });
  // ── Career Stats ────────────────────────────────────────────────────────────
  // Seeds historical per-season career stat lines for imported players.
  // Matches players by first_name + last_name. Skips unmatched rows.

  ipcMain.handle('import-career-stats', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import Career Stats CSV',
      filters: [{ name: 'CSV Files', extensions: ['csv'] }],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) return { success: false, reason: 'Cancelled' };

    try {
      const parsed = parseFile(filePaths[0]);
      if ('error' in parsed) return { success: false, reason: parsed.error };
      const { headers, rows } = parsed;

      const REQUIRED = ['first_name', 'last_name', 'season'];
      const missing = REQUIRED.filter(k => !headers.includes(k));
      if (missing.length) return { success: false, reason: `Missing required columns: ${missing.join(', ')}` };

      const playerRows = db.prepare('SELECT id, first_name, last_name FROM players').all() as { id: number; first_name: string; last_name: string }[];
      const playerMap = new Map<string, number>();
      for (const p of playerRows) {
        playerMap.set(`${p.first_name.toLowerCase()}|${p.last_name.toLowerCase()}`, p.id);
      }

      const teamRows = db.prepare('SELECT id, abbreviation FROM teams').all() as { id: number; abbreviation: string }[];
      const teamMap = new Map<string, number>(teamRows.map(t => [t.abbreviation.toUpperCase(), t.id]));

      const upsert = db.prepare(`
        INSERT INTO career_stats_history (
          player_id, season, games,
          completions, pass_attempts, pass_yards, pass_tds, interceptions,
          rush_attempts, rush_yards, rush_tds,
          targets, receptions, rec_yards, rec_tds,
          tackles, assisted_tackles, sacks, tfl,
          forced_fumbles, fumble_recoveries, def_interceptions, pass_deflections, def_tds,
          team_id
        ) VALUES (
          @player_id, @season, @games,
          @completions, @pass_attempts, @pass_yards, @pass_tds, @interceptions,
          @rush_attempts, @rush_yards, @rush_tds,
          @targets, @receptions, @rec_yards, @rec_tds,
          @tackles, @assisted_tackles, @sacks, @tfl,
          @forced_fumbles, @fumble_recoveries, @def_interceptions, @pass_deflections, @def_tds,
          @team_id
        )
        ON CONFLICT(player_id, season) DO UPDATE SET
          games = excluded.games,
          completions = excluded.completions, pass_attempts = excluded.pass_attempts,
          pass_yards = excluded.pass_yards, pass_tds = excluded.pass_tds,
          interceptions = excluded.interceptions,
          rush_attempts = excluded.rush_attempts, rush_yards = excluded.rush_yards, rush_tds = excluded.rush_tds,
          targets = excluded.targets, receptions = excluded.receptions,
          rec_yards = excluded.rec_yards, rec_tds = excluded.rec_tds,
          tackles = excluded.tackles, assisted_tackles = excluded.assisted_tackles,
          sacks = excluded.sacks, tfl = excluded.tfl,
          forced_fumbles = excluded.forced_fumbles, fumble_recoveries = excluded.fumble_recoveries,
          def_interceptions = excluded.def_interceptions, pass_deflections = excluded.pass_deflections,
          def_tds = excluded.def_tds, team_id = excluded.team_id
      `);

      let imported = 0;
      let skipped = 0;

      db.transaction(() => {
        for (const r of rows) {
          const key = `${col(r, 'first_name').toLowerCase()}|${col(r, 'last_name').toLowerCase()}`;
          const playerId = playerMap.get(key);
          if (!playerId) { skipped++; continue; }

          const abbrRaw = col(r, 'team_abbreviation').toUpperCase().trim();
          const teamId = teamMap.get(abbrRaw) ?? null;

          upsert.run({
            player_id:         playerId,
            season:            iVal(col(r, 'season')),
            games:             iVal(col(r, 'games')),
            completions:       iVal(col(r, 'completions')),
            pass_attempts:     iVal(col(r, 'pass_attempts')),
            pass_yards:        iVal(col(r, 'pass_yards')),
            pass_tds:          iVal(col(r, 'pass_tds')),
            interceptions:     iVal(col(r, 'interceptions')),
            rush_attempts:     iVal(col(r, 'rush_attempts')),
            rush_yards:        iVal(col(r, 'rush_yards')),
            rush_tds:          iVal(col(r, 'rush_tds')),
            targets:           iVal(col(r, 'targets')),
            receptions:        iVal(col(r, 'receptions')),
            rec_yards:         iVal(col(r, 'rec_yards')),
            rec_tds:           iVal(col(r, 'rec_tds')),
            tackles:           fVal(col(r, 'tackles')),
            assisted_tackles:  fVal(col(r, 'assisted_tackles')),
            sacks:             fVal(col(r, 'sacks')),
            tfl:               fVal(col(r, 'tfl')),
            forced_fumbles:    fVal(col(r, 'forced_fumbles')),
            fumble_recoveries: fVal(col(r, 'fumble_recoveries')),
            def_interceptions: fVal(col(r, 'def_interceptions')),
            pass_deflections:  fVal(col(r, 'pass_deflections')),
            def_tds:           fVal(col(r, 'def_tds')),
            team_id:           teamId,
          });
          imported++;
        }
      })();

      return { success: true, imported, skipped };
    } catch (e: any) {
      return { success: false, reason: e.message ?? 'Unknown error' };
    }
  });

}
