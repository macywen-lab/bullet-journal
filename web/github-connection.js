(() => {
  'use strict';

  const siteOrigin = 'https://my-bullet-notebook.workspace-926599.chatgpt.site';
  const pending = new Map();
  let popup;
  let channel;
  let connected = false;
  let nextId = 0;
  let status;
  let connectButton;
  let dialog;
  let unlock;
  const ready = new Promise(resolve => { unlock = resolve; });

  window.requestSyncedJournal = async (path, options = {}) => {
    await ready;
    if (!connected || popup.closed) throw new Error('連線已中斷，請重新連線');
    const {method = 'GET', body: input, signal} = options;
    const body = input instanceof FormData ? [input.get('full'), input.get('thumb')] : input;
    return new Promise((resolve, reject) => {
      const id = ++nextId;
      function finish() {
        window.clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        pending.delete(id);
      }
      function abort() {
        finish();
        reject(new DOMException('已取消請求', 'AbortError'));
      }
      const timeout = window.setTimeout(() => {
        finish();
        reject(new Error('同步連線逾時，請再試一次'));
      }, 30_000);
      if (signal?.aborted) return abort();
      signal?.addEventListener('abort', abort, {once: true});
      pending.set(id, (result) => {
        finish();
        if (result.error) reject(new Error(result.error));
        else resolve(new Response(result.body, {status: result.status}));
      });
      channel.postMessage({id, path, method, body});
    });
  };

  window.addEventListener('message', event => {
    if (connected || event.source !== popup || event.origin !== siteOrigin || event.data?.type !== 'journal-bridge-ready') return;
    channel?.close();
    const {port1, port2} = new MessageChannel();
    const nonce = crypto.randomUUID();
    channel = port1;
    status.textContent = '請在私人網站視窗選擇「允許這次連線」。';
    port1.onmessage = ({data}) => {
      if (!connected) {
        if (data?.type !== 'journal-connected' || data.nonce !== nonce) return;
        connected = true;
        dialog.close();
        unlock();
        return;
      }
      pending.get(data?.id)?.(data);
    };
    popup.postMessage({type: 'journal-connect', nonce}, siteOrigin, [port2]);
  });

  function watchPopup() {
    if (!popup?.closed) return;
    channel?.close();
    if (connected) {
      for (const callback of pending.values()) callback({error: '連線已中斷'});
      location.reload();
      return;
    }
    popup = null;
    status.textContent = '連線視窗已關閉。如果尚未登入，請先在私人網站登入。';
    connectButton.disabled = false;
  }

  window.addEventListener('pagehide', () => {
    channel?.close();
    popup?.close();
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted && connected) location.reload();
  });

  document.addEventListener('DOMContentLoaded', () => {
    dialog = document.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'journal-connection-title');
    dialog.addEventListener('cancel', event => event.preventDefault());
    dialog.innerHTML = `
      <style>
        #journal-connection-title { margin: 0 0 .5rem; font-size: 1.35rem; }
        dialog.journal-connection { width: min(28rem, calc(100% - 2rem)); padding: 1.5rem; border: 1px solid #d9e7e3; border-radius: 14px; color: #193d35; background: #f8faf9; }
        dialog.journal-connection::backdrop { background: #eef5f2; }
        dialog.journal-connection button { background: #164d49; color: white; border: 0; border-radius: .5rem; padding: .55rem .9rem; }
        dialog.journal-connection a { color: #164d49; text-decoration: underline; }
      </style>
      <h1 id="journal-connection-title">我的子彈筆記</h1>
      <p role="status">連線到私人網站，即可使用已同步的筆記。</p>
      <button type="button">連線筆記</button>
      <p><a href="${siteOrigin}/" target="_blank" rel="noopener noreferrer">尚未登入？開啟私人網站登入</a></p>`;
    dialog.className = 'journal-connection';
    status = dialog.querySelector('[role="status"]');
    connectButton = dialog.querySelector('button');
    connectButton.onclick = () => {
      popup = window.open(siteOrigin + '/github-bridge', '_blank', 'popup,width=540,height=580');
      if (!popup) {
        status.textContent = '瀏覽器封鎖了連線視窗。請允許彈出視窗後再試一次。';
        return;
      }
      connectButton.disabled = true;
      status.textContent = '正在開啟私人網站。請登入並確認連線。';
    };
    document.body.append(dialog);
    dialog.showModal();
    window.setInterval(watchPopup, 1000);
  });
})();
