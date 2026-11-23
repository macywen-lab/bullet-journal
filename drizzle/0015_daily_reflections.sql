CREATE TABLE daily_reflections (
  owner TEXT NOT NULL,
  day TEXT NOT NULL,
  content TEXT NOT NULL CHECK (json_valid(content)),
  PRIMARY KEY (owner, day)
);
