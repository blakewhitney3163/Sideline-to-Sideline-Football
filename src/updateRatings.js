const db = require('./database');
const fs = require('fs');
const path = require('path');

function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/['.]/g, '')
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

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

function updateRatings() {
  const csvPath = path.join(process.cwd(), 'madden-ratings.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('madden-ratings.csv not found in project root');
    process.exit(1);
  }

  console.log('Reading Madden ratings CSV...');
  const csvPlayers = parseCSV(csvPath);
  console.log(`Found ${csvPlayers.length} players in CSV`);

  const csvByNormalizedName = new Map();
  for (const p of csvPlayers) {
    if (!p.fullname || !p.overallrating) continue;
    const key = normalizeName(p.fullname);
    csvByNormalizedName.set(key, p);
  }

  const dbPlayers = db.prepare('SELECT id, first_name, last_name, position FROM players').all();
  console.log(`Found ${dbPlayers.length} players in database`);

  const updateById = db.prepare(`
    UPDATE players SET overall_rating = ?, speed = ?, strength = ?, awareness = ?
    WHERE id = ?
  `);

  let exactMatched = 0;
  let fuzzyMatched = 0;
  let positionAveraged = 0;
  const stillUnmatched = [];

  const positionStats = {};
  for (const p of csvPlayers) {
    if (!p.position || !p.overallrating) continue;
    const pos = p.position;
    if (!positionStats[pos]) positionStats[pos] = { ovr: [], spd: [], str: [], awr: [] };
    positionStats[pos].ovr.push(parseInt(p.overallrating) || 70);
    positionStats[pos].spd.push(parseInt(p.speed) || 70);
    positionStats[pos].str.push(parseInt(p.strength) || 70);
    positionStats[pos].awr.push(parseInt(p.awareness) || 70);
  }
  const avg = arr => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  const positionAverages = {};
  for (const [pos, stats] of Object.entries(positionStats)) {
    positionAverages[pos] = {
      ovr: avg(stats.ovr),
      spd: avg(stats.spd),
      str: avg(stats.str),
      awr: avg(stats.awr),
    };
  }

  const POSITION_TO_MADDEN = {
    'QB': 'QB', 'RB': 'HB', 'WR': 'WR', 'TE': 'TE', 'CB': 'CB', 'K': 'K',
    'OL': 'LT', 'DL': 'DT', 'LB': 'MIKE', 'S': 'FS',
  };

  const runUpdates = db.transaction(() => {
    for (const player of dbPlayers) {
      const fullName = `${player.first_name} ${player.last_name}`;
      const normalizedName = normalizeName(fullName);

      let csvMatch = csvByNormalizedName.get(normalizedName);

      if (!csvMatch) {
        const nameNoInitials = normalizedName.replace(/\b\w\b\s*/g, '').trim();
        if (nameNoInitials.length > 3) {
          for (const [key, val] of csvByNormalizedName) {
            const keyNoInitials = key.replace(/\b\w\b\s*/g, '').trim();
            if (keyNoInitials === nameNoInitials) {
              csvMatch = val;
              break;
            }
          }
        }
      }

      if (csvMatch) {
        const wasExact = normalizeName(csvMatch.fullname) === normalizedName;
        updateById.run(
          parseInt(csvMatch.overallrating) || 70,
          parseInt(csvMatch.speed) || 70,
          parseInt(csvMatch.strength) || 70,
          parseInt(csvMatch.awareness) || 70,
          player.id
        );
        if (wasExact) exactMatched++;
        else fuzzyMatched++;
      } else {
        const maddenPos = POSITION_TO_MADDEN[player.position];
        const posAvg = maddenPos ? positionAverages[maddenPos] : null;
        if (posAvg) {
          // Penalty so unmatched depth players rank below real Madden-rated starters
          updateById.run(
            Math.max(55, posAvg.ovr - 8),
            Math.max(55, posAvg.spd - 5),
            Math.max(55, posAvg.str - 5),
            Math.max(55, posAvg.awr - 8),
            player.id
          );
          positionAveraged++;
        } else {
          stillUnmatched.push(fullName);
        }
      }
    }
  });

  runUpdates();

  console.log(`\nPass 1 (exact name):    ${exactMatched} players`);
  console.log(`Pass 2 (fuzzy name):    ${fuzzyMatched} players`);
  console.log(`Pass 3 (pos average):   ${positionAveraged} players`);
  if (stillUnmatched.length > 0) {
    console.log(`Still unmatched:        ${stillUnmatched.length} players`);
  }

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

  console.log('\nFinal rating distribution:');
  for (const row of dist) console.log(`  ${row.tier}: ${row.count} players`);
}

updateRatings();