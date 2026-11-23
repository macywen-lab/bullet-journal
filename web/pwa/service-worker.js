const offlinePage = `<!doctype html><html lang="zh-Hant-TW"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>我的子彈筆記</title>
<style>body{max-width:30rem;margin:18vh auto;padding:0 24px;font:1rem/1.6 system-ui,sans-serif;background:#f8faf9;color:#193d35}a{color:#146255}</style>
<h1>目前未連線</h1><p>請連上網路後重新開啟子彈筆記。</p><a href="/">重新載入</a></html>`;

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.mode !== 'navigate' || url.origin !== self.location.origin || url.pathname !== '/') return;
  // The journal and its private data are always loaded from the server.
  event.respondWith(fetch(event.request).catch(() => new Response(offlinePage, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  })));
});
