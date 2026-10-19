-- Shared visit log for any static site that pings the beacon Worker.
-- Each page sends its own `project` slug; `host` comes from the request Origin.
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ip TEXT, city TEXT, region TEXT, country TEXT,
  asn INTEGER, network TEXT,
  referrer TEXT, path TEXT, user_agent TEXT,
  lang TEXT, tz TEXT, screen TEXT,
  project TEXT, host TEXT, page_title TEXT
);
CREATE INDEX IF NOT EXISTS visits_project_ts ON visits (project, ts);
