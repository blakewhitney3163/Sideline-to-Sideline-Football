#!/usr/bin/env node
/**
 * Run once from project root: node scripts/apply-theme.js
 * Replaces hardcoded hex colors with T.xxx references in all src/*.tsx files
 * and adds the theme import where missing.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

// Standalone quoted color values  e.g.  background: '#141414'
const STANDALONE = [
  ["'#0d0d0d'",  'T.bgPage'],
  ["'#111111'",  'T.bgPage'],
  ["'#111'",     'T.bgPage'],
  ["'#141414'",  'T.bgPanel'],
  ["'#161616'",  'T.bgInput'],
  ["'#1e1e1e'",  'T.bgCard'],
  ["'#1a1a1a'",  'T.bgCard'],
  ["'#2a2a2a'",  'T.borderMid'],
  ["'#3a3a3a'",  'T.borderStrong'],
  ["'#222'",     'T.borderFaint'],
  ["'#333'",     'T.borderStrong'],

  // Text
  ["'#ccc'",  'T.textPrimary'],
  ["'#ddd'",  'T.textPrimary'],
  ["'#aaa'",  'T.textSecondary'],
  ["'#888'",  'T.textMuted'],
  ["'#777'",  'T.textMuted'],
  ["'#666'",  'T.textMuted'],
  ["'#555'",  'T.textMuted'],
  ["'#444'",  'T.textDim'],

  // Tinted backgrounds
  ["'#0a1a0a'",  'T.bgGreen'],
  ["'#1a2a1a'",  'T.bgGreen'],
  ["'#142014'",  'T.bgGreen'],
  ["'#0f1a0f'",  'T.bgGreen'],
  ["'#001a2a'",  'T.bgBlue'],
  ["'#1a1a2a'",  'T.bgBlue'],
  ["'#0a1a3a'",  'T.bgBlue'],
  ["'#1a1a3e'",  'T.bgBlue'],
  ["'#1a0f00'",  'T.bgOrange'],
  ["'#2a1500'",  'T.bgOrange'],
  ["'#1a1000'",  'T.bgOrange'],
  ["'#1a1500'",  'T.bgGold'],
  ["'#001025'",  'T.bgGold'],
  ["'#2a0a0a'",  'T.bgRed'],
  ["'#3a0a0a'",  'T.bgRed'],
  ["'#0a0e18'",  'T.bgSelected'],
];

// Colors embedded inside border strings  e.g.  '1px solid #2a2a2a'
// These get converted to template literals:  `1px solid ${T.borderMid}`
const BORDER_COLORS = [
  ['#2a2a2a',  'T.borderMid'],
  ['#3a3a3a',  'T.borderStrong'],
  ['#1a1a1a',  'T.borderFaint'],
  ['#1e1e1e',  'T.borderFaint'],
  ['#222',     'T.borderFaint'],
  ['#333',     'T.borderStrong'],
  ['#161616',  'T.borderFaint'],
  ['#141414',  'T.bgPanel'],
];

const IMPORT_LINE = "import { T } from './theme';";

function processFile(filePath) {
  let src = fs.readFileSync(filePath, 'utf8');
  const original = src;

  // 1. Add import if missing
  if (!src.includes(IMPORT_LINE)) {
    // Insert after last existing import line
    const lastImport = src.lastIndexOf("\nimport ");
    const insertAt = src.indexOf('\n', lastImport + 1) + 1;
    src = src.slice(0, insertAt) + IMPORT_LINE + '\n' + src.slice(insertAt);
  }

  // 2. Replace standalone quoted colors
  for (const [find, replace] of STANDALONE) {
    // Only replace when the color is a standalone value, not inside a larger string
    // Match the quoted color when surrounded by expected style-object chars
    const regex = new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    src = src.replace(regex, replace);
  }

  // 3. Replace colors embedded in border/shadow strings
  // e.g. '1px solid #2a2a2a' -> `1px solid ${T.borderMid}`
  for (const [hex, token] of BORDER_COLORS) {
    const escapedHex = hex.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match single-quoted strings containing the hex color
    const regex = new RegExp(`'([^']*?)${escapedHex}([^']*?)'`, 'g');
    src = src.replace(regex, (match, before, after) => {
      return `\`${before}\${${token}}${after}\``;
    });
  }

  if (src !== original) {
    fs.writeFileSync(filePath, src, 'utf8');
    console.log(`✓ Updated: ${path.basename(filePath)}`);
  } else {
    console.log(`— No changes: ${path.basename(filePath)}`);
  }
}

const files = fs.readdirSync(SRC)
  .filter(f => f.endsWith('.tsx'))
  .map(f => path.join(SRC, f));

console.log(`Processing ${files.length} files in ${SRC}...\n`);
files.forEach(processFile);
console.log('\nDone. Run npm start to preview the changes.');