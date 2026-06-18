const { db } = require('./database');
const fs = require('fs');
const path = require('path');

const POSITION_MAP = {
  'QB': 'QB',
  'HB': 'RB', 'FB': 'RB',
  'WR': 'WR',
  'TE': 'TE',
  'LT': 'OL', 'LG': 'OL', 'C': 'OL', 'RG': 'OL', 'RT': 'OL',
  'LEDG': 'DL', 'REDG': 'DL', 'DT': 'DL', 'DE': 'DL', 'IDL': 'DL', 'RE': 'DL', 'LE': 'DL',
  'MIKE': 'LB', 'WILL': 'LB', 'LOLB': 'LB', 'ROLB': 'LB', 'MLB': 'LB', 'OLB': 'LB',
  'CB': 'CB',
  'FS': 'S', 'SS': 'S',
  'K': 'K',
};

// CSV columns that are NOT stored as raw integers — handled specially or skipped
const SKIP_CSV = new Set([
  'madden_id', 'team', 'season', 'fullname', 'high_pos_group',
  'position_group', 'position', 'overallrating', 'archetype',
  'runningstyle', 'birthdate', 'return',
]);

function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim());
  return {
    headers,
    rows: lines.slice(1).map(line => {
      const values = line.split(',');
      const row = {};
      headers.forEach((h, i) => row[h] = values[i] ? values[i].trim() : '');
      return row;
    }),
  };
}

function splitName(fullname) {
  const parts = fullname.trim().split(' ');
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function importFromMadden(csvPath) {
  if (!csvPath) csvPath = path.join(process.cwd(), 'src', 'madden-ratings.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('madden-ratings.csv not found at:', csvPath);
    return { imported: 0, error: 'CSV not found' };
  }

  console.log('Reading Madden ratings CSV...');
  const { headers, rows } = parseCSV(csvPath);
  console.log(`Found ${rows.length} players in CSV`);

  const i   = v => parseInt(v) || 0;
  const avg = (...vals) => Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);

  // Raw CSV columns we store directly (all numeric, not in SKIP_CSV)
  const rawCols = headers.filter(h => !SKIP_CSV.has(h));

  // Ensure all raw columns + derived columns exist in players table
  const existingCols = new Set(
    db.prepare('PRAGMA table_info(players)').all().map(c => c.name)
  );
  const derivedCols = ['throw_accuracy', 'throw_power', 'route_running', 'tackle_rating',
    'coverage', 'pass_rush', 'kick_power', 'kick_accuracy', 'kick_return'];
  for (const col of [...rawCols, ...derivedCols]) {
    if (!existingCols.has(col)) {
      db.prepare(`ALTER TABLE players ADD COLUMN ${col} INTEGER DEFAULT 0`).run();
      console.log(`Players: auto-added column ${col}`);
    }
  }

  // Build dynamic INSERT
  const fixedCols = ['team_id', 'first_name', 'last_name', 'position', 'position_label',
    'age', 'overall_rating'];
  const allCols = [...fixedCols, ...rawCols, ...derivedCols];
  const insert = db.prepare(`
    INSERT INTO players (${allCols.join(', ')})
    VALUES (${allCols.map(() => '?').join(', ')})
  `);

  const teams = db.prepare('SELECT id, abbreviation FROM teams').all();
  const teamMap = {};
  for (const t of teams) teamMap[t.abbreviation] = t.id;

  db.prepare('DELETE FROM players').run();
  console.log('Cleared existing players');

  let imported = 0;
  let skipped = 0;

  const runImport = db.transaction(() => {
    for (const p of rows) {
      const position = POSITION_MAP[p.position];
      if (!position) { skipped++; continue; }
      const teamId = teamMap[p.team];
      if (!teamId) { skipped++; continue; }
      const { first, last } = splitName(p.fullname);
      if (!first || !last) { skipped++; continue; }

      // Fixed values
      const fixedVals = [
        teamId, first, last, position, p.position,
        parseInt(p.age) || 25,
        i(p.overallrating),
      ];

      // Raw CSV values (stored as-is)
      const rawVals = rawCols.map(col => i(p[col]));

      // Derived values (computed for UI backward compatibility)
      const derivedVals = [
        avg(i(p.throwaccuracyshort), i(p.throwaccuracymid), i(p.throwaccuracydeep)), // throw_accuracy
        i(p.throwpower),                                                               // throw_power
        avg(i(p.shortrouterunning), i(p.midrouterunning), i(p.deeprouterunning)),    // route_running
        i(p.tackle),                                                                   // tackle_rating
        avg(i(p.mancoverage), i(p.zonecoverage)),                                     // coverage
        avg(i(p.strength), i(p.pursuit)),                                             // pass_rush
        i(p.kickpower),                                                                // kick_power
        i(p.kickaccuracy),                                                             // kick_accuracy
        i(p.return),                                                                   // kick_return
      ];

      insert.run(...fixedVals, ...rawVals, ...derivedVals);
      imported++;
    }
  });

  runImport();

  // Assign dev traits
  const allPlayers = db.prepare('SELECT id, overall_rating FROM players').all();
  const assignTrait = db.prepare("UPDATE players SET dev_trait = ? WHERE id = ?");
  const assignTraits = db.transaction(() => {
    for (const player of allPlayers) {
      const ovr = player.overall_rating;
      const rand = Math.random();
      let trait;
      if (ovr >= 90) {
        trait = rand < 0.40 ? 'X-Factor' : rand < 0.80 ? 'Superstar' : rand < 0.98 ? 'Star' : 'Normal';
      } else if (ovr >= 80) {
        trait = rand < 0.05 ? 'X-Factor' : rand < 0.30 ? 'Superstar' : rand < 0.75 ? 'Star' : 'Normal';
      } else if (ovr >= 70) {
        trait = rand < 0.01 ? 'X-Factor' : rand < 0.09 ? 'Superstar' : rand < 0.44 ? 'Star' : 'Normal';
      } else {
        trait = rand < 0.002 ? 'X-Factor' : rand < 0.022 ? 'Superstar' : rand < 0.202 ? 'Star' : 'Normal';
      }
      assignTrait.run(trait, player.id);
    }
  });
  assignTraits();

  console.log(`Imported: ${imported} players, skipped: ${skipped}`);
  return { imported, skipped };
}

module.exports = { importFromMadden };
