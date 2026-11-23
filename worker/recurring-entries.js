const maxOccurrences = 1000;

function occurrenceDate(start, unit, offset) {
  const day = new Date(start);
  if (unit === 'day' || unit === 'week') {
    day.setUTCDate(start.getUTCDate() + offset * (unit === 'week' ? 7 : 1));
  } else {
    const months = offset * (unit === 'year' ? 12 : 1);
    day.setUTCMonth(start.getUTCMonth() + months + 1, 0);
    day.setUTCDate(Math.min(start.getUTCDate(), day.getUTCDate()));
  }
  return day;
}

function recurringDates(assigned, rule) {
  const {unit, interval, count, until} = rule;
  validate(['day','week','month','year'].includes(unit) &&
    Number.isInteger(interval) && interval >= 1 && interval <= 365, '重複間隔須為 1～365');
  validate((count === undefined) !== (until === undefined), '請選擇重複次數或截止日期');
  const start = date(assigned);
  const limit = until === undefined ? null : date(until);
  if (limit) validate(limit >= start, '截止日期須等於或晚於開始日期');
  else validate(Number.isInteger(count) && count >= 2 && count <= maxOccurrences, '次數須為 2～1,000 次（含首次）');

  const dates = [];
  for (let index = 0; index < (count ?? maxOccurrences + 1); index++) {
    const day = occurrenceDate(start, unit, index * interval);
    if (limit && day > limit) break;
    validate(day.getUTCFullYear() <= 9999, '重複日期超出可用範圍');
    validate(index < maxOccurrences, '每一組最多 1,000 次，請縮短重複期間');
    dates.push(day.toISOString().slice(0, 10));
  }
  validate(dates.length >= 2, '截止日期內須至少包含兩次');
  return dates;
}

async function createRecurringEntries(db, owner, id, view, type, fields, assigned, rule) {
  const dates = recurringDates(assigned, rule);
  const entries = dates.map((day, index) => [index === 0 ? id : crypto.randomUUID(), periodOf(day, view), day]);
  await db.batch([
    db.prepare(`INSERT INTO entries
      (owner,id,view,period,assigned_date,kind,title,description,important,event_time,tags,series_id,series_index)
      SELECT ?1, json_extract(value,'$[0]'), ?3, json_extract(value,'$[1]'),
        json_extract(value,'$[2]'), ?4, ?5, ?6, ?7, ?8, ?9, ?2, key
      FROM json_each(?10)
      WHERE NOT EXISTS (SELECT 1 FROM entry_series WHERE owner=?1 AND id=?2)
      AND NOT EXISTS (SELECT 1 FROM entries WHERE owner=?1 AND id=?2)`)
      .bind(owner,id,view,type,...fields,JSON.stringify(entries)),
    // Retain the series ID so a retry cannot recreate already deleted occurrences.
    db.prepare('INSERT INTO entry_series (owner,id) VALUES (?,?) ON CONFLICT(owner,id) DO NOTHING').bind(owner,id)
  ]);
}
