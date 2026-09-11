-- Kollektiv schema. SQLite dialect (works with better-sqlite3).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  avatar_url     TEXT,
  member_type    TEXT NOT NULL DEFAULT 'explorer', -- explorer | emerging | practitioner | hiring
  goal           TEXT NOT NULL DEFAULT '',
  target_role    TEXT NOT NULL DEFAULT '',
  work_pref      TEXT NOT NULL DEFAULT 'Remote',   -- Remote | Hybrid | Onsite
  availability   TEXT NOT NULL DEFAULT 'Open',     -- Now | Open | Not looking
  is_guide       INTEGER NOT NULL DEFAULT 0,       -- 0/1
  guide_role     TEXT,                              -- e.g. "Senior Product Designer, Northlight Studio"
  guide_focus    TEXT,                              -- e.g. "Portfolio storytelling & career transitions"
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS skills (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL, -- learning | can_demonstrate
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_skills_user ON skills(user_id);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  link        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

CREATE TABLE IF NOT EXISTS circles (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS threads (
  id         TEXT PRIMARY KEY,
  circle_id  TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  author_id  TEXT NOT NULL REFERENCES users(id),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  image_url  TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_threads_circle ON threads(circle_id);
CREATE INDEX IF NOT EXISTS idx_threads_author ON threads(author_id);

CREATE TABLE IF NOT EXISTS replies (
  id         TEXT PRIMARY KEY,
  thread_id  TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  author_id  TEXT NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  is_helpful INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS thread_likes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id  TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, thread_id)
);

CREATE TABLE IF NOT EXISTS reply_likes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reply_id   TEXT NOT NULL REFERENCES replies(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, reply_id)
);
CREATE INDEX IF NOT EXISTS idx_replies_thread ON replies(thread_id);
CREATE INDEX IF NOT EXISTS idx_replies_author ON replies(author_id);

CREATE TABLE IF NOT EXISTS opportunities (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  company      TEXT NOT NULL,
  type         TEXT NOT NULL, -- Full-time | Internship | Freelance | Paid Challenge | Fellowship | Apprenticeship
  location     TEXT NOT NULL,
  pay          TEXT NOT NULL,
  blurb        TEXT NOT NULL,
  pay_verified INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interests (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, opportunity_id)
);

CREATE TABLE IF NOT EXISTS milestones (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_milestones (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_id  TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  completed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, milestone_id)
);

-- Recognitions are real: they're created when a thread author marks a reply as
-- helpful (see POST /api/threads/:id/replies/:replyId/helpful), not floating flavor text.
CREATE TABLE IF NOT EXISTS recognitions (
  id           TEXT PRIMARY KEY,
  to_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  text         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_recognitions_to ON recognitions(to_user_id);

CREATE TABLE IF NOT EXISTS field_theme (
  id             TEXT PRIMARY KEY DEFAULT 'current',
  name           TEXT NOT NULL,
  guide_text     TEXT NOT NULL,
  critique_text  TEXT NOT NULL,
  challenge_text TEXT NOT NULL,
  circle_slug    TEXT NOT NULL DEFAULT 'portfolios'
);

CREATE TABLE IF NOT EXISTS digest_items (
  id         TEXT PRIMARY KEY,
  text       TEXT NOT NULL,
  author_id  TEXT REFERENCES users(id),
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS glossary_terms (
  id         TEXT PRIMARY KEY,
  term       TEXT NOT NULL,
  definition TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS learning_path_items (
  id         TEXT PRIMARY KEY,
  path       TEXT NOT NULL, -- starter | growing | advanced
  text       TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_map_items (
  id         TEXT PRIMARY KEY,
  category   TEXT NOT NULL, -- e.g. Craft | Research | Collaboration
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  pay_range  TEXT NOT NULL,
  note       TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
