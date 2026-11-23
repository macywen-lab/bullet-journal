const dialog = document.getElementById('phoneCalendarDialog');
const status = document.getElementById('phoneCalendarStatus');
const create = document.getElementById('phoneCalendarPair');
const disconnect = document.getElementById('phoneCalendarDisconnect');
const refresh = document.getElementById('phoneCalendarRefresh');
const secretRow = document.getElementById('phoneCalendarSecretRow');
const secret = document.getElementById('phoneCalendarSecret');
const close = document.getElementById('phoneCalendarClose');
const accountList = document.getElementById('phoneCalendarAccounts');
const pairing = document.getElementById('phoneCalendarPairing');
const open = document.getElementById('phoneCalendarOpen');
const isAndroid = /Android/i.test(navigator.userAgent);

function renderAccounts(accounts) {
  accountList.replaceChildren();
  accountList.hidden = !accounts?.length;
  if (accountList.hidden) return;
  const title = document.createElement('h3');
  title.textContent = '已同步的帳號';
  accountList.append(title);
  for (const account of accounts) {
    const row = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = account.label + ' · ' + account.calendars.length + ' 個行事曆';
    const calendars = document.createElement('ul');
    for (const name of account.calendars) {
      const item = document.createElement('li');
      item.textContent = name;
      calendars.append(item);
    }
    row.append(summary,calendars);
    accountList.append(row);
  }
}
let linked = false;

async function run(action) {
  if (close.disabled) return;
  const controls = [create, disconnect, refresh, close];
  controls.forEach(button => button.disabled = true);
  status.textContent = '處理中…';
  try {
    const result = await call(action);
    if (action === 'createPhoneCalendarPair') {
      linked = true;
      secret.value = result.token;
      secretRow.hidden = false;
      secret.focus();
      secret.select();
      status.textContent = '請將配對碼貼到手機同步 App。產生新配對碼後，舊配對碼會失效。';
    } else if (action === 'disconnectPhoneCalendar') {
      linked = false;
      renderAccounts(null);
      secretRow.hidden = true;
      secret.value = '';
      status.textContent = '已解除配對，這支手機同步的行程已從子彈筆記移除。';
      document.dispatchEvent(new Event('phone-calendar-updated'));
    } else {
      linked = result.linked;
      renderAccounts(result.accounts);
      status.textContent = result.syncedOn
        ? '已同步 ' + result.sourceCount + ' 個行事曆、' + result.eventCount + ' 筆行程。上次同步：' +
          new Date(result.syncedOn).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})
        : '尚未收到手機行程。';
      if (result.syncedOn && !result.accounts && isAndroid) {
        status.textContent += '。更新手機同步 App 並同步一次後，這裡會列出帳號。';
      }
      document.dispatchEvent(new Event('phone-calendar-updated'));
    }
  } catch (error) {
    status.textContent = error.message;
  } finally {
    controls.forEach(button => button.disabled = false);
    disconnect.disabled = !linked;
  }
}

open.addEventListener('click', () => {
  dialog.showModal();
  run('phoneCalendarStatus');
});
close.addEventListener('click', () => dialog.close());
dialog.addEventListener('cancel', event => { if (close.disabled) event.preventDefault(); });
dialog.addEventListener('close', () => {
  secretRow.hidden = true;
  secret.value = '';
  pairing.open = false;
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && dialog.open) void run('phoneCalendarStatus');
});
const page = new URL(location.href);
const calendarMode = page.searchParams.get('calendar');
if (calendarMode === 'accounts' || calendarMode === 'install') {
  page.searchParams.delete('calendar');
  history.replaceState(history.state,'',page);
  showSettings(true);
  open.click();
  if (calendarMode === 'install') pairing.open = true;
}
create.addEventListener('click', () => {
  if (!linked || confirm('產生新的配對碼會讓原本手機的配對碼失效。要繼續嗎？')) run('createPhoneCalendarPair');
});
disconnect.addEventListener('click', () => {
  if (confirm('解除配對後，手機同步的行程會從子彈筆記移除。確定要解除配對嗎？')) run('disconnectPhoneCalendar');
});
refresh.addEventListener('click', () => run('phoneCalendarStatus'));
document.getElementById('phoneCalendarCopy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(secret.value);
    status.textContent = '已複製配對碼，請貼到手機同步 App。';
  } catch {
    secret.select();
    status.textContent = '請選取配對碼後手動複製。';
  }
});
