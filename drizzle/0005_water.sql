CREATE TABLE water_settings (
  owner TEXT PRIMARY KEY NOT NULL,
  cup_ml INTEGER NOT NULL CHECK (cup_ml BETWEEN 1 AND 5000),
  goal_ml INTEGER NOT NULL CHECK (goal_ml BETWEEN 1 AND 20000)
);
--> statement-breakpoint
CREATE TABLE water_cups (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  drink_date TEXT NOT NULL,
  amount_ml INTEGER NOT NULL CHECK (amount_ml BETWEEN 1 AND 5000),
  goal_ml INTEGER NOT NULL CHECK (goal_ml BETWEEN 1 AND 20000),
  PRIMARY KEY (owner, id)
);
--> statement-breakpoint
CREATE INDEX water_cups_owner_date ON water_cups(owner, drink_date);
