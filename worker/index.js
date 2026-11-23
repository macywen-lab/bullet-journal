const views = ['Day', 'Week', 'Month', 'Year'];
const types = ['TASK', 'NOTE', 'EVENT'];
const effectiveDate = "COALESCE(NULLIF(assigned_date,''),period)";
const dueDate = `CASE
  WHEN view='Week' AND assigned_date='' THEN date(period,'+6 days')
  WHEN view='Month' AND assigned_date='' THEN date(period,'+1 month','-1 day')
  WHEN view='Year' AND assigned_date='' THEN date(period,'+1 year','-1 day')
  WHEN plan_precision='month' THEN date(${effectiveDate},'start of month','+1 month','-1 day')
  WHEN plan_precision='week' THEN date(${effectiveDate},'weekday 6')
  ELSE ${effectiveDate} END`;
const migrationDates = `
  CASE WHEN source_id<>'' THEN (
    SELECT COALESCE(NULLIF(source.assigned_date,''), source.period)
    FROM entries AS source WHERE source.owner=entries.owner AND source.id=entries.source_id
  ) END AS migrated_from,
  CASE WHEN status='MIGRATED' THEN (
    SELECT COALESCE(NULLIF(target.assigned_date,''), target.period)
    FROM entries AS target WHERE target.owner=entries.owner AND target.source_id=entries.id
      AND target.kind=entries.kind
    ORDER BY target.created DESC, target.id DESC LIMIT 1
  ) END AS migrated_to`;
const uuidPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

class RequestError extends Error {}

function validate(condition, message) {
  if (!condition) throw new RequestError(message);
}

function date(value) {
  validate(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), '請選擇有效日期');
  const day = new Date(value + 'T00:00:00Z');
  validate(Number.isFinite(+day) && day.toISOString().slice(0, 10) === value, '日期不存在');
  return day;
}

function periodOf(value, view, offset = 0) {
  const day = date(value);
  if (view === 'Day') day.setUTCDate(day.getUTCDate() + offset);
  if (view === 'Week') day.setUTCDate(day.getUTCDate() - day.getUTCDay() + offset * 7);
  if (view === 'Month') day.setUTCMonth(day.getUTCMonth() + offset, 1);
  if (view === 'Year') day.setUTCFullYear(day.getUTCFullYear() + offset, 0, 1);
  return day.toISOString().slice(0, 10);
}

function todayInTaiwan() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' });
}

function textField(value, limit, label, required = false) {
  const text = typeof value === 'string' ? value.trim() : '';
  validate(text.length <= limit && (!required || text.length), label + '須符合字數限制（最多 ' + limit + ' 字）');
  return text;
}

function details(input, type, planning = false) {
  const title = textField(input.title, 160, '標題', true);
  const description = textField(input.description, 3000, '內容');
  const time = (type === 'EVENT' || planning) ? (input.time || '') : '';
  validate(typeof time === 'string' && (!time || /^([01]\d|2[0-3]):[0-5]\d$/.test(time)), '時間格式不正確');
  const tags = new Map();
  for (const raw of Array.isArray(input.tags) ? input.tags.slice(0, 20) : []) {
    const tag = textField(raw, 24, '標籤').replace(/^#+/, '').trim();
    if (tag && !tags.has(tag.toLowerCase())) tags.set(tag.toLowerCase(), tag);
  }
  return [title, description, input.important === true ? 1 : 0, time, JSON.stringify([...tags.values()])];
}

function validatePlanDate(view, precision, assigned) {
  if (precision === 'date') return;
  const day = date(assigned);
  validate(
    (view === 'Year' && precision === 'month' && day.getUTCDate() === 1) ||
    (view === 'Month' && precision === 'week' && (day.getUTCDay() === 0 || day.getUTCDate() === 1)),
    '日期類型不符合這個頁籤'
  );
}

function createStatement(db, owner, id, view, period, assigned, type, fields, precision) {
  return db.prepare(`INSERT INTO entries (owner,id,view,period,assigned_date,kind,title,description,important,event_time,tags,plan_precision)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,id) DO NOTHING`)
    .bind(owner, id, view, period, assigned, type, ...fields, precision);
}

function present(row) {
  return {
    id: row.id, view: row.view, period: row.period, assignedDate: row.assigned_date,
    displayDate: row.display_date, dueDate: row.due_date, type: row.kind, status: row.status,
    title: row.title, description: row.description, important: Boolean(row.important), precision: row.plan_precision,
    everOverdue: Boolean(row.overdue), time: row.event_time, tags: JSON.parse(row.tags),
    migratedFrom: row.migrated_from, migratedTo: row.migrated_to, recurring: Boolean(row.series_id)
  };
}

async function handleAction(env, owner, { action, args }) {
  const db = env.DB;
  validate(Array.isArray(args), '缺少操作參數');
  const today = todayInTaiwan();

  if (habitActions.includes(action)) return habitAction(db, owner, action, args, today);

  if (['createPhoneCalendarPair','disconnectPhoneCalendar','phoneCalendarStatus'].includes(action)) {
    return phoneCalendarAction(db, owner, action);
  }

  if (action === 'getDailyReflection' || action === 'saveDailyReflection') {
    const [day, fields] = args;
    date(day);
    if (action === 'getDailyReflection') {
      const record = await db.prepare('SELECT content FROM daily_reflections WHERE owner=? AND day=?')
        .bind(owner, day).first();
      return record ? JSON.parse(record.content) : {};
    }
    validate(fields && typeof fields === 'object' && !Array.isArray(fields), '每日回顧資料無效');
    const updates = Object.entries(fields);
    validate(updates.length > 0 && updates.every(([name, value]) =>
      ['affirmation','gratitude1','gratitude2','gratitude3','review'].includes(name) &&
      typeof value === 'string' && value.length <= 500), '每日回顧每欄最多 500 字');
    const record = await db.prepare(`INSERT INTO daily_reflections (owner,day,content) VALUES (?,?,?)
      ON CONFLICT(owner,day) DO UPDATE SET content=json_patch(daily_reflections.content,excluded.content)
      RETURNING content`).bind(owner, day, JSON.stringify(fields)).first();
    return JSON.parse(record.content);
  }

  if (action === 'listReport') {
    const start = periodOf(today, 'Day', -5);
    const end = periodOf(today, 'Day', 6);
    const [records, phone] = await db.batch([
      db.prepare(`SELECT entries.*, ${effectiveDate} AS display_date, ${dueDate} AS due_date,
        ${migrationDates},
        CASE WHEN kind='TASK' AND source_id<>'' THEN date(created, '+8 hours') END AS migrated_on
        FROM entries
        WHERE owner=? AND kind IN ('TASK','EVENT') AND
        ((${effectiveDate} >= ? AND ${effectiveDate} < ?) OR
        (kind='TASK' AND ${effectiveDate} < ? AND
        ((status='OPEN' AND ${dueDate} < ?) OR
        (status='DONE' AND completed_on >= ? AND completed_on < ?))))
        ORDER BY created ASC, id ASC`)
        .bind(owner, start, end, start, today, start, end),
      db.prepare('SELECT snapshot FROM phone_calendar_link WHERE owner=?').bind(owner)
    ]);
    const items = records.results.map(row => ({
      ...present(row),
      migratedOn: row.migrated_on,
      reportDate: row.display_date >= start ? row.display_date : (row.status === 'DONE' ? row.completed_on : today)
    }));
    for (const event of showPhoneCalendar(phone.results[0]?.snapshot, start, end)) {
      items.push({ ...event, reportDate: event.displayDate });
    }
    return { today, start, through: periodOf(today, 'Day', 5), items };
  }

  if (action === 'listEntries') {
    const [view, period] = args;
    validate(views.includes(view) && periodOf(period, view) === period, '時間區間不正確');
    const end = periodOf(period, view, 1);
    const dailyView = view === 'Day';
    const dated = "(view='Day' OR (assigned_date<>'' AND plan_precision='date'))";
    const [, result, phone] = await db.batch([
      db.prepare(`UPDATE entries SET overdue=1 WHERE owner=? AND kind='TASK'
        AND status='OPEN' AND overdue=0 AND ${dueDate} < ?`).bind(owner, today),
      db.prepare(`SELECT entries.*, ${effectiveDate} AS display_date, ${dueDate} AS due_date, ${migrationDates},
        (
          SELECT json_group_array(id) FROM (
            SELECT id FROM note_photos WHERE owner=entries.owner AND entry_id=entries.id ORDER BY created,id
          )
        ) AS photos FROM entries
        WHERE owner=? AND (
          (${effectiveDate} >= ? AND ${effectiveDate} < ? AND (? OR ${dated})) OR
          (view=? AND period=? AND (assigned_date='' OR plan_precision<>'date')) OR
          (${dated} AND kind='TASK' AND (
            (? AND status='OPEN' AND ${dueDate} < ?) OR
            (? AND status='DONE' AND completed_on=? AND ${dueDate} < completed_on)
          ))
        )
        ORDER BY overdue DESC, display_date ASC, important DESC, created ASC, id ASC`)
        .bind(owner, period, end, Number(view === 'Year'), view, period,
          Number(dailyView && period === today), today, Number(dailyView), period),
      db.prepare('SELECT snapshot FROM phone_calendar_link WHERE owner=?').bind(owner)
    ]);
    const items = result.results.map(row => ({
      ...present(row), ...(row.photos ? { photos: JSON.parse(row.photos) } : {})
    }));
    items.push(...showPhoneCalendar(phone.results[0]?.snapshot, period, end));
    return items;
  }

  if (action === 'appendEntry') {
    const [view, period, type, title, description, important, dateValue, time, tags, id, precision = 'date', recurrence] = args;
    validate(views.includes(view) && types.includes(type) && typeof id === 'string' && uuidPattern.test(id), '新增資料無效');
    const assigned = dateValue || '';
    validate(periodOf(period, view) === period &&
      (assigned ? periodOf(assigned, view) === period : view !== 'Day'), '日期不在所選期間');
    validatePlanDate(view, precision, assigned);
    const fields = details({ title, description, important, time, tags }, type, view !== 'Day');
    if (recurrence != null) {
      validate(typeof recurrence === 'object' && (type === 'TASK' || type === 'EVENT') &&
        assigned && precision === 'date', '重複項目須為指定日期的 Task 或 Event');
      await createRecurringEntries(db, owner, id, view, type, fields, assigned, recurrence);
    } else {
      await createStatement(db, owner, id, view, period, assigned, type, fields, precision).run();
    }
    return { ok: true, id };
  }

  const [id, value, targetDate] = args;
  validate(typeof id === 'string' && uuidPattern.test(id), '筆記編號不正確');

  if (action === 'deleteEntry') {
    validate(value === undefined || value === 'single' || value === 'future', '刪除範圍無效');
    const targets = `SELECT occurrence.id FROM entries AS selected
      JOIN entries AS occurrence ON occurrence.owner=selected.owner
      AND (occurrence.id=selected.id OR (occurrence.series_id=selected.series_id
        AND occurrence.series_index ${value === 'future' ? '>=' : '='} selected.series_index))
      WHERE selected.owner=?1 AND selected.id=?2`;
    const [photos] = await db.batch([
      db.prepare(`DELETE FROM note_photos WHERE owner=?1 AND entry_id IN (${targets}) RETURNING object_key`).bind(owner, id),
      db.prepare(`DELETE FROM entries WHERE owner=?1 AND id IN (${targets})`).bind(owner, id)
    ]);
    await removeUnusedPhotos(env, owner, photos.results.map(row => row.object_key));
    return { ok: true };
  }

  const taskStatusUpdate = action === 'updateEntry' && typeof value?.status === 'string';
  if (taskStatusUpdate || action === 'taskMenuAction') {
    const transitions = { COMPLETE: ['DONE', 'OPEN', 'DONE'], REOPEN: ['OPEN', 'DONE', 'CANCELLED'], CANCEL: ['CANCELLED', 'OPEN', 'DONE'] };
    const transition = action === 'taskMenuAction' && Object.hasOwn(transitions, value) ? transitions[value] :
      action === 'updateEntry' && value.status === 'DONE' ? transitions.COMPLETE :
      action === 'updateEntry' && value.status === 'OPEN' ? ['OPEN', 'OPEN', 'DONE'] : null;
    validate(transition, '任務狀態無效');
    const [status, from, alsoFrom] = transition;
    const change = await db.prepare(`UPDATE entries SET status=?, overdue=CASE WHEN ${dueDate} < ?
      AND (status='OPEN' OR ?='OPEN') THEN 1 ELSE overdue END,
      completed_on=CASE
        WHEN ?<>'DONE' THEN ''
        WHEN status='DONE' THEN completed_on
        ELSE ? END
      WHERE owner=? AND id=? AND kind='TASK' AND status IN (?,?)`)
      .bind(status, today, status, status, today, owner, id, from, alsoFrom).run();
    validate(change.meta.changes > 0, '任務狀態已變更，請重新整理後再試');
    return { ok: true };
  }

  if (action === 'updateEntry') {
    validate(value && typeof value === 'object', '更新資料無效');
    const current = await db.prepare('SELECT view,period,kind,plan_precision FROM entries WHERE owner=? AND id=?')
      .bind(owner, id).first();
    validate(current, '找不到筆記');
    const assigned = value.assignedDate || '';
    validate(assigned || current.view !== 'Day', '請選擇日期');
    const period = assigned ? periodOf(assigned, current.view) : (value.period ?? current.period);
    validate(periodOf(period, current.view) === period, '時間區間不正確');
    const precision = value.precision ?? current.plan_precision;
    validatePlanDate(current.view, precision, assigned);
    const fields = details(value, current.kind, current.view !== 'Day');
    const change = await db.prepare(`UPDATE entries SET title=?, description=?, important=?, event_time=?, tags=?,
      overdue=CASE WHEN kind='TASK' AND status='OPEN' AND ${dueDate} < ? THEN 1 ELSE overdue END,
      assigned_date=?, period=?, plan_precision=? WHERE owner=? AND id=?`).bind(...fields, today, assigned, period, precision, owner, id).run();
    validate(change.meta.changes > 0, '找不到筆記');
    return { ok: true };
  }

  if (action === 'migrateEntryToDate') {
    const destination = date(value).toISOString().slice(0, 10);
    validate(typeof targetDate === 'string' && uuidPattern.test(targetDate), '遷移資料無效');
    const [, change] = await db.batch([
      db.prepare(`INSERT INTO entries (owner,id,view,period,assigned_date,kind,title,description,important,tags,source_id,series_id,series_index)
        SELECT owner,?,'Day',?,?,kind,title,description,important,tags,id,series_id,series_index FROM entries
        WHERE owner=? AND id=? AND kind IN ('TASK','NOTE') AND status='OPEN' AND ${effectiveDate} <> ?
        ON CONFLICT(owner,id) DO NOTHING`).bind(targetDate, destination, destination, owner, id, destination),
      db.prepare(`UPDATE entries SET status='MIGRATED',
        overdue=CASE WHEN kind='TASK' AND ${dueDate} < ? THEN 1 ELSE overdue END
        WHERE owner=? AND id=? AND EXISTS
        (SELECT 1 FROM entries copy WHERE copy.owner=? AND copy.id=? AND copy.source_id=?)`)
        .bind(today, owner, id, owner, targetDate, id)
    ]);
    validate(change.meta.changes > 0, '請選擇不同日期，或重新整理確認這筆紀錄是否已遷移');
    return { ok: true };
  }

  throw new RequestError('操作不受支援');
}

const noCache = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && ['/github-bridge', '/github-bridge.js'].includes(url.pathname)) {
      if (!request.headers.get('oai-authenticated-user-id')) return new Response(null, { status: 401, headers: noCache });
      const page = url.pathname === '/github-bridge';
      return new Response(page ? GITHUB_BRIDGE_PAGE : GITHUB_BRIDGE_SCRIPT, { headers: {
        ...noCache,
        'Content-Type': page ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'"
      } });
    }
    if (url.pathname === '/' && request.method === 'GET') {
      return new Response(PAGE, { headers: { ...noCache, 'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'self'; connect-src 'self' blob: data:; img-src 'self' blob: data:; manifest-src 'self'; worker-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'" } });
    }
    if (request.method === 'GET' && Object.hasOwn(APP_ASSETS, url.pathname)) {
      const { type, content } = APP_ASSETS[url.pathname];
      return new Response(Uint8Array.from(atob(content), byte => byte.charCodeAt(0)), {
        headers: { ...noCache, 'Content-Type': type }
      });
    }
    if (request.method === 'GET' && url.pathname === '/phone-calendar.mjs') {
      return new Response(PHONE_CALENDAR_SCRIPT, {
        headers: { ...noCache, 'Content-Type': 'text/javascript; charset=utf-8' }
      });
    }
    if (url.pathname === '/api/phone-calendar/snapshot' && request.method === 'POST') {
      return receivePhoneCalendar(request, env);
    }
    if (url.pathname === '/downloads/phone-calendar-sync.apk' && request.method === 'GET') {
      if (!request.headers.get('oai-authenticated-user-id')) return new Response(null, { status: 401 });
      return new Response(Uint8Array.from(atob(PHONE_SYNC_APK), byte => byte.charCodeAt(0)), {
        headers: { ...noCache, 'Content-Type': 'application/vnd.android.package-archive',
          'Content-Disposition': 'attachment; filename="phone-calendar-sync.apk"' }
      });
    }
    const photoRoute = url.pathname.match(/^\/api\/note-photos\/([^/]+)\/([^/]+)(?:\/(thumb|full))?$/);
    if (photoRoute) {
      return handleNotePhoto(request, env, request.headers.get('oai-authenticated-user-id'), ...photoRoute.slice(1));
    }
    if (url.pathname !== '/api/entries' || request.method !== 'POST') return new Response(null, { status: 404 });
    const owner = request.headers.get('oai-authenticated-user-id');
    if (!owner) return Response.json({ error: '請使用擁有此 App 的 ChatGPT 帳號登入' }, { status: 401, headers: noCache });
    const contentType = request.headers.get('Content-Type') || '';
    if (request.headers.get('Origin') !== url.origin || !contentType.startsWith('application/json')) {
      return Response.json({ error: '請從 App 內操作' }, { status: 403, headers: noCache });
    }
    try {
      const input = await request.text();
      validate(input.length <= 16000, '筆記資料過長');
      const payload = JSON.parse(input);
      validate(payload && typeof payload === 'object', '資料格式不正確');
      const result = await handleAction(env, owner, payload);
      return Response.json(result, { headers: noCache });
    } catch (error) {
      const invalid = error instanceof RequestError || error instanceof SyntaxError;
      return Response.json({ error: invalid ? (error instanceof SyntaxError ? '資料格式不正確' : error.message) :
        '資料暫時無法存取，請稍後重試' }, { status: invalid ? 400 : 500, headers: noCache });
    }
  }
};
