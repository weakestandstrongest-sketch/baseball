// public/icons/icon.svg から各サイズの PNG アイコンを作る
//   node dev/make-icons.mjs   (Playwright の Chromium を使う)
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const DIR = new URL('../public/icons/', import.meta.url).pathname;
const svg = readFileSync(DIR + 'icon.svg', 'utf8');
// maskable (Android の丸や角丸に切り抜かれる用): 絵柄を 74% に縮めて安全領域に収める
const maskable = svg
  .replace(/(<rect width="1024" height="1024" fill="url\(#bgd\)"\/>)/, '$1<g transform="translate(512 512) scale(0.74) translate(-512 -500)">')
  .replace('</svg>', '</g></svg>');

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
async function shoot(src, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:#000">${src.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: DIR + file, clip: { x: 0, y: 0, width: size, height: size } });
}
await shoot(svg, 180, 'apple-touch-icon.png');
await shoot(svg, 192, 'icon-192.png');
await shoot(svg, 512, 'icon-512.png');
await shoot(maskable, 512, 'maskable-512.png');
await shoot(svg, 32, 'favicon-32.png');
await browser.close();
console.log('icons updated');
