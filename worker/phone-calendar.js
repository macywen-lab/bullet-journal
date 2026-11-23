const calendarSyncLimit = 1_400_000;

async function tokenHash(secret) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function calendarAccountSummary(accounts, sourceCount) {
  if (accounts === undefined) return null;
  validate(Array.isArray(accounts) && accounts.length <= sourceCount, '帳號格式無效');
  let count = 0;
  const summary = accounts.map(account => {
    validate(account && Array.isArray(account.calendars) && account.calendars.length > 0 && account.calendars.length <= sourceCount, '行事曆清單無效');
    count += account.calendars.length;
    return {
      label: textField(account.label, 120, '帳號類別', true),
      calendars: account.calendars.map(name => textField(name, 120, '行事曆名稱', true))
    };
  });
  validate(count === sourceCount, '行事曆數量不符');
  return JSON.stringify(summary);
}

async function receivePhoneCalendar(request, env) {
  if (!env.CALENDAR_RELAY_KEY || request.headers.get('X-Calendar-Relay-Key') !== env.CALENDAR_RELAY_KEY) {
    return Response.json({ error: '未授權的同步端點' }, { status: 401, headers: noCache });
  }

  const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token) return Response.json({ error: '手機尚未配對' }, { status: 401, headers: noCache });

  try {
    const input = await request.text();
    validate(new TextEncoder().encode(input).length <= calendarSyncLimit, '同步檔案大小超過限制');
    const payload = JSON.parse(input);
    validate(payload && Array.isArray(payload.events) && payload.events.length <= 4000, '行程格式無效');
    validate(Number.isInteger(payload.sourceCount) && payload.sourceCount > 0 && payload.sourceCount <= 1000, '行事曆數量無效');
    const accounts = calendarAccountSummary(payload.accounts, payload.sourceCount);
    const events = new Map();
    for (const event of payload.events) {
      validate(event && typeof event.id === 'string' && /^[0-9]{1,19}:[0-9]{1,19}:-?[0-9]{1,19}$/.test(event.id), '行程編號無效');
      date(event.date);
      const [title, , , time] = details(event, 'EVENT');
      const source = textField(event.source, 120, '來源', true);
      events.set(event.id, { id: event.id, date: event.date, time, title, source });
    }
    const results = [...events.values()].sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    const update = await env.DB.prepare(`UPDATE phone_calendar_link
      SET snapshot=?, source_count=?, synced_on=?, accounts=? WHERE token_hash=?`)
      .bind(JSON.stringify(results), payload.sourceCount, new Date().toISOString(), accounts, await tokenHash(token)).run();
    if (!update.meta.changes) return Response.json({ error: '配對碼已無效' }, { status: 401, headers: noCache });
    return Response.json({ count: results.length }, { headers: noCache });
  } catch (error) {
    const invalid = error instanceof RequestError || error instanceof SyntaxError;
    return Response.json({ error: invalid ? '同步行程資料無效' : '同步暫時無法完成' },
      { status: invalid ? 400 : 500, headers: noCache });
  }
}

async function phoneCalendarAction(db, owner, action) {
  if (action === 'createPhoneCalendarPair') {
    const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    await db.prepare(`INSERT INTO phone_calendar_link (owner,token_hash) VALUES (?,?)
      ON CONFLICT(owner) DO UPDATE SET token_hash=excluded.token_hash`).bind(owner, await tokenHash(token)).run();
    return { token };
  }
  if (action === 'disconnectPhoneCalendar') {
    await db.prepare('DELETE FROM phone_calendar_link WHERE owner=?').bind(owner).run();
    return { linked: false };
  }
  const row = await db.prepare(`SELECT synced_on, source_count, accounts, json_array_length(snapshot) AS event_count
    FROM phone_calendar_link WHERE owner=?`).bind(owner).first();
  return row ? { linked: true, syncedOn: row.synced_on, sourceCount: row.source_count, eventCount: row.event_count,
    accounts: row.accounts ? JSON.parse(row.accounts) : null } : { linked: false };
}

function showPhoneCalendar(snapshot, start, end) {
  return (snapshot ? JSON.parse(snapshot) : []).filter(event => event.date >= start && event.date < end).map(event => ({
    id: 'phone:' + event.id, view: 'Day', displayDate: event.date, assignedDate: event.date,
    type: 'EVENT', status: 'OPEN', title: event.title, time: event.time, phoneCalendar: event.source,
    tags: ['手機行事曆']
  }));
}
