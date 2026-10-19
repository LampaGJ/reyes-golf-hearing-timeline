CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ip TEXT, city TEXT, region TEXT, country TEXT,
  asn INTEGER, network TEXT,
  referrer TEXT, path TEXT, user_agent TEXT,
  lang TEXT, tz TEXT, screen TEXT
);
