ALTER TABLE entries ADD COLUMN plan_precision TEXT NOT NULL DEFAULT 'date'
  CHECK (plan_precision IN ('date', 'month', 'week'));
