// Run once: node scripts/fetch-career-stats.js
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '../src/data/player-career-stats.csv');
const URL = 'https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats_season.csv';
const MIN_SEASON = 2013;
const SKILL = new Set(['QB', 'RB', 'WR', 'TE']);

function get(url, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 6) return reject(new Error('Too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'nfl-sim/1.0' } }, res => {
      if ([301,302,307,308].includes(res.statusCode)) return resolve(get(res.headers.location, hops + 1));
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('Downloading nflverse player_stats_season.csv...');
  const raw = await get(URL);
  console.log(`Downloaded ${(raw.length / 1024 / 1024).toFixed(1)} MB`);

  const lines = raw.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim());

  const KEEP = ['player_display_name','position','season','games',
    'completions','attempts','passing_yards','passing_tds','interceptions',
    'carries','rushing_yards','rushing_tds',
    'receptions','targets','receiving_yards','receiving_tds'];

  const out = [KEEP.join(',')];
  let kept = 0;

  for (const line of lines.slice(1)) {
    const vals = line.split(',');
    const r = {};
    headers.forEach((h, i) => { r[h] = (vals[i] ?? '').trim(); });

    if (r.season_type !== 'REG') continue;
    if (parseInt(r.season) < MIN_SEASON) continue;
    if (!r.player_display_name) continue;
    if (!SKILL.has(r.position_group || r.position)) continue;

    out.push(KEEP.map(col => {
      const v = r[col] ?? '';
      return v.includes(',') ? `"${v}"` : v;
    }).join(','));
    kept++;
  }

  fs.writeFileSync(OUTPUT, out.join('\n'));
  console.log(`Done — ${kept} rows saved to ${OUTPUT}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });