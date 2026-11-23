(() => {
  'use strict';

  const githubOrigin = 'https://macywen-lab.github.io';
  const opener = window.opener;
  const status = document.getElementById('status');
  const approve = document.getElementById('approve');
  const photoPath = /^\/api\/note-photos\/[\da-f-]{36}\/[\da-f-]{36}(\/(?:thumb|full))?$/i;
  let approved = false;

  async function request({path, method, body}) {
    if (path === '/api/entries' && method === 'POST' && typeof body === 'string' && body.length <= 16000) {
      return fetch(path, {
        method, body, headers: {'Content-Type': 'application/json'},
        redirect: 'error', cache: 'no-store'
      });
    }
    const match = typeof path === 'string' && photoPath.exec(path);
    if (match?.[1] && method === 'GET' || match && !match[1] && method === 'DELETE') {
      return fetch(path, {method, redirect: 'error', cache: 'no-store'});
    }
    if (match && !match[1] && method === 'PUT' && Array.isArray(body) && body.length === 2) {
      const form = new FormData();
      for (const [index, name] of ['full', 'thumb'].entries()) {
        const file = body[index];
        if (!(file instanceof Blob) || file.size > (index === 0 ? 1_500_000 : 100_000)) {
          throw new Error('照片格式或大小不符');
        }
        form.append(name, file, name);
      }
      return fetch(path, {method, body: form, redirect: 'error', cache: 'no-store'});
    }
    throw new Error('不支援的筆記請求');
  }

  if (!opener) return;
  window.addEventListener('message', event => {
    if (approved || event.source !== opener || event.origin !== githubOrigin || event.data?.type !== 'journal-connect') return;
    const {nonce} = event.data;
    if (typeof nonce !== 'string' || nonce.length !== 36 || event.ports.length !== 1) return;
    const port = event.ports[0];
    status.textContent = '允許後，這個 GitHub Pages 視窗可讀寫你現有的筆記。請在此次使用期間保持此視窗開啟。';
    approve.disabled = false;
    approve.onclick = () => {
      approved = true;
      approve.disabled = true;
      status.textContent = '已連線。請回到 GitHub Pages 的子彈筆記分頁。關閉此視窗即可中斷連線。';
      port.postMessage({type: 'journal-connected', nonce});
      port.onmessage = async ({data}) => {
        if (!data || !Number.isSafeInteger(data.id)) return;
        try {
          const result = await request(data);
          port.postMessage({id: data.id, status: result.status, body: await result.blob()});
        } catch (error) {
          port.postMessage({id: data.id, error: error.message || '無法連線至筆記'});
        }
      };
      window.addEventListener('pagehide', () => port.close(), {once: true});
      opener.focus();
    };
  });
  opener.postMessage({type: 'journal-bridge-ready'}, githubOrigin);
})();
