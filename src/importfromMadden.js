const db = require('./database');
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

function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const row = {};
    headers.forEach((h, i) => row[h] = values[i] ? values[i].trim() : '');
    return row;
  });
}

function splitName(fullname) {
  const parts = fullname.trim().split(' ');
  const first = parts[0];
  const last = parts.slice(1).join(' ');
  return { first, last };
}

function importFromMadden() {
  const csvPath = path.join(process.cwd(), 'madden-ratings.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('madden-ratings.csv not found in project root');
    process.exit(1);
  }

  console.log('Reading Madden ratings CSV...');
  const csvPlayers = parseCSV(csvPath);
  console.log(`Found ${csvPlayers.length} players in CSV`);

  const teams = db.prepare('SELECT id, abbreviation FROM teams').all();
  const teamMap = {};
  for (const t of teams) teamMap[t.abbreviation] = t.id;

  db.prepare('DELETE FROM stats').run();
  db.prepare('DELETE FROM players').run();
  console.log('Cleared existing players and stats');

  const insert = db.prepare(`
    INSERT INTO players (team_id, first_name, last_name, position, position_label, age, overall_rating, speed, strength, awareness)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let imported = 0;
  let skipped = 0;

  const runImport = db.transaction(() => {
    for (const p of csvPlayers) {
      const position = POSITION_MAP[p.position];
      if (!position) { skipped++; continue; }

      const teamId = teamMap[p.team];
      if (!teamId) { skipped++; continue; }

      const { first, last } = splitName(p.fullname);
      if (!first || !last) { skipped++; continue; }

      insert.run(
        teamId, first, last,
        position,
        p.position,   // real Madden position label (LE, RE, MLB, HB, etc.)
        parseInt(p.age) || 25,
        parseInt(p.overallrating) || 70,
        parseInt(p.speed) || 70,
        parseInt(p.strength) || 70,
        parseInt(p.awareness) || 70
      );
      imported++;
    }
  });

  runImport();

  console.log(`\nImported: ${imported} players`);
  console.log(`Skipped:  ${skipped} (punters, long snappers, unknown teams)`);

  const breakdown = db.prepare(`
    SELECT position_label, COUNT(*) as count
    FROM players GROUP BY position_label ORDER BY count DESC
  `).all();

  console.log('\nPlayers by position:');
  for (const row of breakdown) console.log(`  ${row.position_label}: ${row.count}`);
}

importFromMadden();