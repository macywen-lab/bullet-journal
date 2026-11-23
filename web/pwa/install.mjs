const launchMode = window.matchMedia('(display-mode: standalone)');
const button = document.getElementById('installJournal');
const hint = document.getElementById('installJournalHint');
let installRequest;
let installedInBrowser = false;
let showingPrompt = false;

function displayInstallStatus(message) {
  const installed = installedInBrowser || launchMode.matches || navigator.standalone === true;
  button.hidden = installed;
  button.disabled = showingPrompt;
  hint.textContent = installed
    ? '子彈筆記已安裝。'
    : message || '安裝後可從手機主畫面開啟子彈筆記。';
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installRequest = event;
  displayInstallStatus();
});

button.addEventListener('click', async () => {
  if (showingPrompt) return;
  const request = installRequest;
  if (!request) {
    const appleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    displayInstallStatus(appleMobile
      ? '請在 Safari 點「分享」→「加入主畫面」。'
      : '若瀏覽器沒有跳出安裝視窗，請點 Chrome 的 ⋮ →「安裝應用程式」或「新增至主畫面」。');
    return;
  }

  installRequest = null;
  showingPrompt = true;
  displayInstallStatus();
  try {
    await request.prompt();
    const result = await request.userChoice;
    if (result.outcome === 'accepted') installedInBrowser = true;
  } catch {
    displayInstallStatus('請使用 Chrome 的 ⋮ 選單安裝，或重新開啟網頁再試一次。');
    return;
  } finally {
    showingPrompt = false;
    button.disabled = false;
  }
  displayInstallStatus();
});

window.addEventListener('appinstalled', () => {
  installedInBrowser = true;
  installRequest = null;
  displayInstallStatus();
});
launchMode.addEventListener('change', () => displayInstallStatus());
displayInstallStatus();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('service-worker.js', document.baseURI)).catch(() => {
    // Chrome's menu remains available when service-worker registration fails.
  });
}
