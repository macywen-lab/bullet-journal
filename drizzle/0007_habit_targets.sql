ALTER TABLE habits ADD COLUMN kind TEXT NOT NULL DEFAULT 'custom' CHECK (kind IN ('water','custom'));
--> statement-breakpoint
ALTER TABLE habits ADD COLUMN frequency TEXT NOT NULL DEFAULT 'Daily' CHECK (frequency IN ('Daily','Weekly'));
--> statement-breakpoint
ALTER TABLE habits ADD COLUMN goal REAL NOT NULL DEFAULT 1 CHECK (goal > 0);
--> statement-breakpoint
ALTER TABLE habits ADD COLUMN amount REAL NOT NULL DEFAULT 1 CHECK (amount > 0);
--> statement-breakpoint
ALTER TABLE habits ADD COLUMN unit TEXT NOT NULL DEFAULT '次' CHECK (length(unit) BETWEEN 1 AND 16);
--> statement-breakpoint
ALTER TABLE habits ADD COLUMN removed INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0,1));
--> statement-breakpoint
CREATE TABLE habit_logs (
  owner TEXT NOT NULL,
  habit_id TEXT NOT NULL,
  id TEXT NOT NULL,
  day TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  goal REAL NOT NULL CHECK (goal > 0),
  unit TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('Daily','Weekly')),
  PRIMARY KEY (owner,habit_id,id),
  FOREIGN KEY (owner,habit_id) REFERENCES habits(owner,id)
);
--> statement-breakpoint
CREATE INDEX habit_logs_owner_day ON habit_logs(owner,day,habit_id);
--> statement-breakpoint
INSERT INTO habits(owner,id,title,kind,goal,amount,unit)
SELECT owners.owner,'00000000-0000-4000-8000-000000000001','Water 喝水紀錄','water',
  COALESCE(settings.goal_ml,2000),COALESCE(settings.cup_ml,250),'mL'
FROM (SELECT owner FROM water_settings UNION SELECT owner FROM water_cups) AS owners
LEFT JOIN water_settings AS settings ON settings.owner=owners.owner;
--> statement-breakpoint
INSERT INTO habit_logs(owner,habit_id,id,day,amount,goal,unit,frequency)
SELECT owner,'00000000-0000-4000-8000-000000000001',id,drink_date,amount_ml,goal_ml,'mL','Daily'
FROM water_cups ORDER BY rowid;
--> statement-breakpoint
INSERT INTO habit_logs(owner,habit_id,id,day,amount,goal,unit,frequency)
SELECT owner,habit_id,day,day,1,1,'次','Daily' FROM habit_checkins ORDER BY rowid;
