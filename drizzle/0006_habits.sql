CREATE TABLE habits (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 48),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  PRIMARY KEY (owner,id)
);
--> statement-breakpoint
CREATE TABLE habit_checkins (
  owner TEXT NOT NULL,
  habit_id TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (owner,habit_id,day),
  FOREIGN KEY (owner,habit_id) REFERENCES habits(owner,id)
);
