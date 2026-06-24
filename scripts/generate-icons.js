const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
const svgPath = path.join(assetsDir, 'icon.svg');

if (!fs.existsSync(svgPath)) {
  console.error('ERROR: assets/icon.svg not found.');
  process.exit(1);
}

console.log('Installing icon tools...');
execSync('npm install --save-dev sharp to-ico png2icons', { stdio: 'inherit' });

const sharp = require('sharp');
const toIco = require('to-ico');
const png2icons = require('png2icons');

async function run() {
  console.log('\nGenerating PNG sizes from SVG...');

  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoBuffers = [];

  for (const size of icoSizes) {
    const buf = await sharp(svgPath).resize(size, size).png().toBuffer();
    icoBuffers.push(buf);
    process.stdout.write(`  ${size}x${size} ✓\n`);
  }

  const png1024 = await sharp(svgPath).resize(1024, 1024).png().toBuffer();
  fs.writeFileSync(path.join(assetsDir, 'icon.png'), png1024);
  console.log('  1024x1024 ✓');

  console.log('\nCreating icon.ico (Windows)...');
  const icoBuffer = await toIco(icoBuffers);
  fs.writeFileSync(path.join(assetsDir, 'icon.ico'), icoBuffer);
  console.log('  assets/icon.ico ✓');

  console.log('\nCreating icon.icns (macOS)...');
  const icnsBuffer = png2icons.createICNS(png1024, png2icons.BILINEAR, 0);
  if (icnsBuffer) {
    fs.writeFileSync(path.join(assetsDir, 'icon.icns'), icnsBuffer);
    console.log('  assets/icon.icns ✓');
  } else {
    console.warn('  icon.icns skipped (macOS only needed for Mac builds)');
  }

  console.log('\nDone. assets/icon.ico and assets/icon.icns are ready.');
}

run().catch(err => {
  console.error('\nFailed:', err.message);
  process.exit(1);
});
