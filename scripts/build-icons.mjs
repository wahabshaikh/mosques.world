/**
 * Renders the PWA icons from the logo mark with the bundled Chromium:
 *   node scripts/build-icons.mjs
 * Writes public/icons/icon-{192,512}.png, maskable-512.png (logo inside the 80% safe zone) and apple-touch-icon.png.
 */
import { chromium } from "@playwright/test";

const mark = (scale) => `
  <g transform="translate(${16 - 16 * scale} ${16 - 16 * scale}) scale(${scale})">
    <path fill="#fff" d="M16 5c.5 2.4 1.8 4.2 2.8 5.5 1.2 1.5 2 2.8 2 4.3a4.8 4.8 0 0 1-9.6 0c0-1.5.8-2.8 2-4.3C14.2 9.2 15.5 7.4 16 5Z"/>
    <path fill="none" stroke="#fff" stroke-width="1.8" d="M7 26V16a9 9 0 0 1 18 0v10"/>
    <path fill="#fff" d="M14.3 26v-3.6h3.4V26z"/>
  </g>`;
const icons = [
  { file: "icon-192.png", size: 192, rx: 8, scale: 1 },
  { file: "icon-512.png", size: 512, rx: 8, scale: 1 },
  { file: "apple-touch-icon.png", size: 180, rx: 0, scale: 0.9 },
  { file: "maskable-512.png", size: 512, rx: 0, scale: 0.72 },
];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage();
for (const icon of icons) {
  await page.setViewportSize({ width: icon.size, height: icon.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${icon.size}" height="${icon.size}">
      <rect width="32" height="32" rx="${icon.rx}" fill="#0B6E4F"/>${mark(icon.scale)}</svg></body></html>`,
  );
  await page.screenshot({ path: `public/icons/${icon.file}`, omitBackground: true });
}
await browser.close();
