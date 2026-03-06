import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'assets', 'images');

// Full app icon SVG (navy bg + lime bag + fork details)
const fullIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1024" height="1024">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1A1A2E"/>
      <stop offset="100%" style="stop-color:#16213E"/>
    </linearGradient>
    <linearGradient id="ac" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#E8F5A3"/>
      <stop offset="100%" style="stop-color:#C8E96E"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <path d="M180 210 L152 390 L360 390 L332 210 Z" fill="none" stroke="url(#ac)" stroke-width="18" stroke-linejoin="round"/>
  <path d="M210 210 C210 155 302 155 302 210" fill="none" stroke="url(#ac)" stroke-width="18" stroke-linecap="round"/>
  <line x1="228" y1="272" x2="228" y2="300" stroke="#E8F5A3" stroke-width="11" stroke-linecap="round"/>
  <line x1="256" y1="268" x2="256" y2="296" stroke="#E8F5A3" stroke-width="11" stroke-linecap="round"/>
  <line x1="284" y1="272" x2="284" y2="300" stroke="#E8F5A3" stroke-width="11" stroke-linecap="round"/>
  <line x1="256" y1="304" x2="256" y2="348" stroke="#E8F5A3" stroke-width="11" stroke-linecap="round"/>
  <path d="M228 300 Q256 316 284 300" fill="none" stroke="#E8F5A3" stroke-width="11" stroke-linecap="round"/>
  <circle cx="330" cy="254" r="5" fill="#C8E96E" opacity="0.9"/>
  <circle cx="348" cy="238" r="3.5" fill="#C8E96E" opacity="0.6"/>
  <circle cx="344" cy="270" r="2.5" fill="#C8E96E" opacity="0.4"/>
</svg>`;

// Foreground only (transparent bg) for Android adaptive icon
const foregroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="ac" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#E8F5A3"/>
      <stop offset="100%" style="stop-color:#C8E96E"/>
    </linearGradient>
  </defs>
  <path d="M180 210 L152 390 L360 390 L332 210 Z" fill="none" stroke="url(#ac)" stroke-width="18" stroke-linejoin="round"/>
  <path d="M210 210 C210 155 302 155 302 210" fill="none" stroke="url(#ac)" stroke-width="18" stroke-linecap="round"/>
  <line x1="228" y1="272" x2="228" y2="300" stroke="#E8F5A3" stroke-width="11" stroke-linecap="round"/>
  <line x1="256" y1="268" x2="256" y2="296" stroke="#E8F5A3" stroke-width="11" stroke-linecap="round"/>
  <line x1="284" y1="272" x2="284" y2="300" stroke="#E8F5A3" stroke-width="11" stroke-linecap="round"/>
  <line x1="256" y1="304" x2="256" y2="348" stroke="#E8F5A3" stroke-width="11" stroke-linecap="round"/>
  <path d="M228 300 Q256 316 284 300" fill="none" stroke="#E8F5A3" stroke-width="11" stroke-linecap="round"/>
</svg>`;

// Background gradient for Android adaptive icon
const backgroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1A1A2E"/>
      <stop offset="100%" style="stop-color:#16213E"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
</svg>`;

// Monochrome (single color, simplified) for Android
const monochromeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="432" height="432">
  <path d="M180 210 L152 390 L360 390 L332 210 Z" fill="none" stroke="#000" stroke-width="20" stroke-linejoin="round"/>
  <path d="M210 210 C210 155 302 155 302 210" fill="none" stroke="#000" stroke-width="20" stroke-linecap="round"/>
  <line x1="256" y1="265" x2="256" y2="350" stroke="#000" stroke-width="20" stroke-linecap="round"/>
</svg>`;

async function generate() {
  // icon.png — 1024x1024
  await sharp(Buffer.from(fullIconSvg))
    .resize(1024, 1024)
    .png()
    .toFile(join(outDir, 'icon.png'));
  console.log('icon.png (1024x1024)');

  // splash-icon.png — 1024x1024 (same as icon)
  await sharp(Buffer.from(fullIconSvg))
    .resize(1024, 1024)
    .png()
    .toFile(join(outDir, 'splash-icon.png'));
  console.log('splash-icon.png (1024x1024)');

  // favicon.png — 48x48
  await sharp(Buffer.from(fullIconSvg))
    .resize(48, 48)
    .png()
    .toFile(join(outDir, 'favicon.png'));
  console.log('favicon.png (48x48)');

  // android-icon-foreground.png — 512x512
  await sharp(Buffer.from(foregroundSvg))
    .resize(512, 512)
    .png()
    .toFile(join(outDir, 'android-icon-foreground.png'));
  console.log('android-icon-foreground.png (512x512)');

  // android-icon-background.png — 512x512
  await sharp(Buffer.from(backgroundSvg))
    .resize(512, 512)
    .png()
    .toFile(join(outDir, 'android-icon-background.png'));
  console.log('android-icon-background.png (512x512)');

  // android-icon-monochrome.png — 432x432
  await sharp(Buffer.from(monochromeSvg))
    .resize(432, 432)
    .png()
    .toFile(join(outDir, 'android-icon-monochrome.png'));
  console.log('android-icon-monochrome.png (432x432)');

  console.log('\nAll icons generated!');
}

generate().catch(console.error);
