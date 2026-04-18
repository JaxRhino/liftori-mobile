/**
 * gen-assets.mjs
 *
 * One-shot asset generator: renders the SVG sources in `assets-src/` to the
 * PNG sizes Expo expects in `assets/`.
 *
 * Run once after a fresh clone (or any time you edit the SVGs):
 *
 *   npm install --legacy-peer-deps
 *   npm run assets:gen
 *
 * Requires `sharp` (declared as a devDependency).
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcDir = join(root, 'assets-src');
const outDir = join(root, 'assets');

mkdirSync(outDir, { recursive: true });

const targets = [
  { src: 'icon.svg', out: 'icon.png', width: 1024, height: 1024 },
  { src: 'adaptive-icon.svg', out: 'adaptive-icon.png', width: 1024, height: 1024 },
  { src: 'splash.svg', out: 'splash.png', width: 1284, height: 2778 },
  // web favicon
  { src: 'icon.svg', out: 'favicon.png', width: 48, height: 48 },
  // notification icon (Android small icon — white silhouette would be ideal but
  // a scaled emerald mark renders fine; Android tints non-white pixels to white)
  { src: 'adaptive-icon.svg', out: 'notification-icon.png', width: 96, height: 96 },
];

for (const t of targets) {
  const srcPath = join(srcDir, t.src);
  const outPath = join(outDir, t.out);
  const svg = readFileSync(srcPath);
  await sharp(svg, { density: 384 })
    .resize(t.width, t.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`wrote ${t.out} (${t.width}x${t.height})`);
}

console.log('\nDone — assets are in ./assets/');
