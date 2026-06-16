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

function importFromMadden(csvPath) {
  if (!csvPath) csvPath = path.join(process.cwd(), 'src', 'madden-ratings.csv');

  if (!fs.existsSync(csvPath)) {
    console.error('madden-ratings.csv not found at:', csvPath);
    return { imported: 0, error: 'CSV not found' };
  }

  console.log('Reading Madden ratings CSV...');
  const csvPlayers = parseCSV(csvPath);
  console.log(`Found ${csvPlayers.length} players in CSV`);

  const teams = db.prepare('SELECT id, abbreviation FROM teams').all();
  const teamMap = {};
  for (const t of teams) teamMap[t.abbreviation] = t.id;

  db.prepare('DELETE FROM players').run();
  console.log('Cleared existing players');

  const insert = db.prepare(`
    INSERT INTO players (
      team_id, first_name, last_name, position, position_label, age,
      overall_rating, speed, strength, awareness,
      throw_accuracy, throw_power, catching, route_running,
      tackle_rating, coverage, pass_rush
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const i   = v => parseInt(v) || 70;
  const avg = (...vals) => Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);

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
        teamId, first, last, position, p.position,
        parseInt(p.age) || 25,
        i(p.overallrating),
        i(p.speed),
        i(p.strength),
        i(p.awareness),
        avg(i(p.throwaccuracyshort), i(p.throwaccuracymid), i(p.throwaccuracydeep)),
        i(p.throwpower),
        avg(i(p.catching), i(p.catchintraffic)),
        avg(i(p.shortrouterunning), i(p.midrouterunning), i(p.deeprouterunning)),
        i(p.tackle),
        avg(i(p.mancoverage), i(p.zonecoverage)),
        avg(i(p.strength), i(p.pursuit))
      );
      imported++;
    }
  });

  runImport();

  // Assign dev traits to freshly imported players
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

  console.log(`Imported: ${imported} players, dev traits assigned`);
  return { imported };
}

if (require.main === module) {
  importFromMadden();
}

module.exports = { importFromMadden };