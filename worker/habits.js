const defaultWaterId = '00000000-0000-4000-8000-000000000001';
const habitViews = ['Day', 'Week', 'Month'];
const habitActions = [
  'listHabits', 'listHabitSettings', 'restoreWater', 'saveHabit', 'updateHabit',
  'setHabitActive', 'deleteHabit', 'addHabitLog', 'removeHabitLog'
];

function habitFields(input) {
  validate(input && typeof input === 'object', '請填寫打卡設定');
  const { frequency, goal, amount } = input;
  validate(['Daily','Weekly'].includes(frequency), '請選擇 Daily 或 Weekly');
  for (const number of [goal,amount]) {
    validate(Number.isFinite(number) && number >= 0.001 && number <= 1000000 &&
      Math.round(number * 1000) / 1000 === number, '數量與目標須介於 0.001 至 1,000,000，小數最多 3 位');
  }
  return [textField(input.title,48,'打卡名稱',true),frequency,goal,amount,textField(input.unit,16,'單位',true)];
}

function seedWater(db, owner) {
  return db.prepare(`INSERT INTO habits(owner,id,title,kind,goal,amount,unit)
    VALUES (?,?,'Water 喝水紀錄','water',2000,250,'mL')
    ON CONFLICT(owner,id) DO NOTHING`).bind(owner,defaultWaterId);
}

async function habitAction(db, owner, action, args, today) {
  const visible = db.prepare(`SELECT id,title,kind,active,frequency,goal,amount,unit
    FROM habits WHERE owner=? AND removed=0 ORDER BY kind DESC,active DESC,rowid`).bind(owner);
  if (action === 'listHabitSettings') {
    const [, settings] = await db.batch([seedWater(db,owner),visible]);
    return settings.results;
  }

  if (action === 'listHabits') {
    const [view, start] = args;
    validate(habitViews.includes(view) && periodOf(start, view) === start, '打卡日期不正確');
    const end = periodOf(start,view,1);
    const fromWeek = periodOf(start,'Week');
    const toWeek = periodOf(periodOf(end,'Day',-1),'Week',1);
    const [, settings, totals] = await db.batch([
      seedWater(db,owner),
      visible,
      db.prepare(`WITH days AS (
        SELECT habit_id,day,frequency,unit,SUM(amount) AS total,COUNT(*) AS count,MAX(rowid) AS latest
        FROM habit_logs WHERE owner=? AND day<=? AND (
          (frequency='Daily' AND day>=? AND day<?) OR
          (frequency='Weekly' AND day>=? AND day<?)
        ) GROUP BY habit_id,day,frequency,unit
      )
      SELECT days.habit_id AS habitId,days.day,days.frequency,days.unit,
        days.total,days.count,log.goal,log.id AS lastId,days.latest
      FROM days JOIN habit_logs AS log ON log.rowid=days.latest
      ORDER BY days.day,days.latest`).bind(owner,today,start,end,fromWeek,toWeek)
    ]);
    const byHabit = new Map(settings.results.map(habit=>[habit.id,{...habit,logs:[]}]));
    for (const log of totals.results) byHabit.get(log.habitId)?.logs.push(log);
    return { today, habits:[...byHabit.values()].filter(habit=>habit.active || habit.logs.length) };
  }

  if (action === 'restoreWater') {
    await db.batch([
      seedWater(db,owner),
      db.prepare(`UPDATE habits SET removed=0,active=1
        WHERE owner=? AND id=? AND removed=1 AND NOT EXISTS (
          SELECT 1 FROM habits WHERE owner=? AND kind='water' AND removed=0
        )`).bind(owner,defaultWaterId,owner)
    ]);
    return {ok:true};
  }

  const [id, value, logId] = args;
  validate(typeof id === 'string' && uuidPattern.test(id), '打卡項目編號不正確');
  if (action === 'saveHabit') {
    validate(id !== defaultWaterId && ['water','custom'].includes(value?.kind), '打卡類別不正確');
    const fields = habitFields(value);
    await db.prepare(`INSERT INTO habits(owner,id,kind,title,frequency,goal,amount,unit) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(owner,id) DO NOTHING`).bind(owner,id,value.kind,...fields).run();
  } else if (action === 'updateHabit') {
    await db.prepare(`UPDATE habits SET title=?,frequency=?,goal=?,amount=?,unit=?
      WHERE owner=? AND id=? AND removed=0`).bind(...habitFields(value),owner,id).run();
  } else if (action === 'setHabitActive') {
    validate(typeof value === 'boolean', '打卡狀態不正確');
    await db.prepare('UPDATE habits SET active=? WHERE owner=? AND id=? AND removed=0')
      .bind(Number(value),owner,id).run();
  } else if (action === 'deleteHabit') {
    const statements = [
      db.prepare('DELETE FROM habit_logs WHERE owner=? AND habit_id=?').bind(owner,id),
      db.prepare('DELETE FROM habit_checkins WHERE owner=? AND habit_id=?').bind(owner,id)
    ];
    if (id === defaultWaterId) {
      statements.push(seedWater(db,owner),
        db.prepare('DELETE FROM water_cups WHERE owner=?').bind(owner),
        db.prepare('DELETE FROM water_settings WHERE owner=?').bind(owner),
        db.prepare(`UPDATE habits SET removed=1,active=0,title='Water 喝水紀錄',
          frequency='Daily',goal=2000,amount=250,unit='mL' WHERE owner=? AND id=?`).bind(owner,id));
    } else {
      statements.push(db.prepare('DELETE FROM habits WHERE owner=? AND id=?').bind(owner,id));
    }
    await db.batch(statements);
  } else {
    date(value);
    validate(value <= today, '請選擇今天或之前的日期打卡');
    if (action === 'addHabitLog') {
      validate(typeof logId === 'string' && uuidPattern.test(logId), '打卡紀錄編號不正確');
      await db.prepare(`INSERT INTO habit_logs(owner,habit_id,id,day,amount,goal,unit,frequency)
        SELECT owner,id,?,?,amount,goal,unit,frequency FROM habits
        WHERE owner=? AND id=? AND active=1 AND removed=0
        ON CONFLICT(owner,habit_id,id) DO NOTHING`).bind(logId,value,owner,id).run();
    } else {
      validate(typeof logId === 'string' && (uuidPattern.test(logId) || logId === value), '打卡紀錄編號不正確');
      const active = 'EXISTS (SELECT 1 FROM habits WHERE owner=? AND id=? AND active=1 AND removed=0)';
      const statements = [
        db.prepare('DELETE FROM habit_logs WHERE owner=? AND habit_id=? AND day=? AND id=? AND '+active)
          .bind(owner,id,value,logId,owner,id)
      ];
      if (id === defaultWaterId) {
        statements.push(db.prepare('DELETE FROM water_cups WHERE owner=? AND drink_date=? AND id=? AND '+active)
          .bind(owner,value,logId,owner,id));
      } else if (logId === value) {
        statements.push(db.prepare('DELETE FROM habit_checkins WHERE owner=? AND habit_id=? AND day=? AND '+active)
          .bind(owner,id,value,owner,id));
      }
      await db.batch(statements);
    }
  }
  return {ok:true};
}
