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

  // Build team abbreviation -> id map
  const teams = db.prepare('SELECT id, abbreviation FROM teams').all();
  const teamMap = {};
  for (const t of teams) teamMap[t.abbreviation] = t.id;

  // Clear existing players
  db.prepare('DELETE FROM stats').run();
  db.prepare('DELETE FROM players').run();
  console.log('Cleared existing players and stats');

  const insert = db.prepare(`
    INSERT INTO players (team_id, first_name, last_name, position, age, overall_rating, speed, strength, awareness)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let imported = 0;
  let skipped = 0;

  const runImport = db.transaction(() => {
    for (const p of csvPlayers) {
      // Skip punters and players without a position mapping
      const position = POSITION_MAP[p.position];
      if (!position) { skipped++; continue; }

      // Skip if team not found
      const teamId = teamMap[p.team];
      if (!teamId) { skipped++; continue; }

      const { first, last } = splitName(p.fullname);
      if (!first || !last) { skipped++; continue; }

      const age = parseInt(p.age) || 25;
      const ovr = parseInt(p.overallrating) || 70;
      const spd = parseInt(p.speed) || 70;
      const str = parseInt(p.strength) || 70;
      const awr = parseInt(p.awareness) || 70;

      insert.run(teamId, first, last, position, age, ovr, spd, str, awr);
      imported++;
    }
  });

  runImport();

  console.log(`\nImported: ${imported} players`);
  console.log(`Skipped:  ${skipped} (punters, special teams, unknown teams)`);

  // Show breakdown by position
  const breakdown = db.prepare(`
    SELECT position, COUNT(*) as count
    FROM players GROUP BY position ORDER BY count DESC
  `).all();

  console.log('\nPlayers by position:');
  for (const row of breakdown) console.log(`  ${row.position}: ${row.count}`);

  // Show rating distribution
  const dist = db.prepare(`
    SELECT
      CASE
        WHEN overall_rating >= 90 THEN '90-99 (Elite)'
        WHEN overall_rating >= 80 THEN '80-89 (Pro Bowl)'
        WHEN overall_rating >= 70 THEN '70-79 (Starter)'
        ELSE 'Below 70 (Backup)'
      END as tier,
      COUNT(*) as count
    FROM players GROUP BY tier ORDER BY tier DESC
  `).all();

  console.log('\nRating distribution:');
  for (const row of dist) console.log(`  ${row.tier}: ${row.count}`);
}

importFromMadden();