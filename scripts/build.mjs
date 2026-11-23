import { mkdir, readFile, writeFile } from 'node:fs/promises';

const html = await readFile('web/index.html', 'utf8');
const worker = await readFile('worker/index.js', 'utf8');
const recurring = await readFile('worker/recurring-entries.js', 'utf8');
const photos = await readFile('worker/note-photos.js', 'utf8');
const phone = await readFile('worker/phone-calendar.js', 'utf8');
const habits = await readFile('worker/habits.js', 'utf8');
const apk = await readFile('android/release/phone-calendar-sync.apk', 'base64');
const phoneCalendarScript = await readFile('web/phone-calendar.mjs', 'utf8');
const assetSources = {
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
  '/service-worker.js': ['service-worker.js', 'text/javascript; charset=utf-8'],
  '/pwa/install.mjs': ['install.mjs', 'text/javascript; charset=utf-8'],
  '/pwa/icon-192.png': ['icon-192.png', 'image/png'],
  '/pwa/icon-512.png': ['icon-512.png', 'image/png'],
  '/pwa/icon-48.png': ['icon-48.png', 'image/png'],
  '/pwa/icon-1024.png': ['icon-1024.png', 'image/png'],
  '/pwa/icon-maskable.png': ['icon-maskable.png', 'image/png']
};
const appAssets = {};
for (const [route, [name, type]] of Object.entries(assetSources)) {
  appAssets[route] = { type, content: await readFile('web/pwa/' + name, 'base64') };
}
await mkdir('dist/server', { recursive: true });
await writeFile('dist/server/index.js',
  'const APP_ASSETS = ' + JSON.stringify(appAssets) + ';\n' +
  'const PAGE = ' + JSON.stringify(html) + ';\n' +
  'const PHONE_CALENDAR_SCRIPT = ' + JSON.stringify(phoneCalendarScript) + ';\n' +
  'const PHONE_SYNC_APK = ' + JSON.stringify(apk) + ';\n' + phone + '\n' + photos + '\n' + habits + '\n' + recurring + '\n' + worker);
