-- Kollektiv schema. PostgreSQL 13+ (gen_random_uuid() is built in).
-- Run once:  psql "$DATABASE_URL" -f schema.postgres.sql

CREATE TABLE IF NOT EXISTS users (
  id               TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name             TEXT NOT NULL,
  email            TEXT NOT NULL,
  password_hash    TEXT,                              -- NULL for Google-only accounts
  google_id        TEXT UNIQUE,                       -- Google "sub" claim
  avatar_url       TEXT,
  member_type      TEXT NOT NULL DEFAULT 'explorer',  -- explorer | emerging | practitioner | hiring
  goal             TEXT NOT NULL DEFAULT '',
  bio              TEXT NOT NULL DEFAULT '',
  location         TEXT NOT NULL DEFAULT '',
  field            TEXT NOT NULL DEFAULT '',
  experience_level TEXT NOT NULL DEFAULT '',
  education        TEXT NOT NULL DEFAULT '',
  certifications   TEXT NOT NULL DEFAULT '',
  github_url       TEXT,
  linkedin_url     TEXT,
  website_url      TEXT,
  target_role      TEXT NOT NULL DEFAULT '',
  work_pref        TEXT NOT NULL DEFAULT 'Remote',    -- Remote | Hybrid | Onsite
  availability     TEXT NOT NULL DEFAULT 'Open',      -- Now | Open | Not looking
  is_guide         BOOLEAN NOT NULL DEFAULT FALSE,
  guide_role       TEXT,
  guide_focus      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_has_login CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)
);
-- Case-insensitive unique email (Foo@x.com == foo@x.com)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'general',
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  link       TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);

CREATE TABLE IF NOT EXISTS skills (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('learning','can_demonstrate')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_skills_user ON skills(user_id);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  link        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

CREATE TABLE IF NOT EXISTS circles (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS threads (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  circle_id  TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  image_url  TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_threads_circle ON threads(circle_id);
CREATE INDEX IF NOT EXISTS idx_threads_author ON threads(author_id);

CREATE TABLE IF NOT EXISTS replies (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  thread_id  TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  author_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  is_helpful BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_replies_thread ON replies(thread_id);
CREATE INDEX IF NOT EXISTS idx_replies_author ON replies(author_id);

CREATE TABLE IF NOT EXISTS thread_likes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id  TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, thread_id)
);

CREATE TABLE IF NOT EXISTS reply_likes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reply_id   TEXT NOT NULL REFERENCES replies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, reply_id)
);

CREATE TABLE IF NOT EXISTS opportunities (
  id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title             TEXT NOT NULL,
  company           TEXT NOT NULL,
  type              TEXT NOT NULL, -- Full-time | Internship | Freelance | Paid Challenge | Fellowship | Apprenticeship
  location          TEXT NOT NULL,
  pay               TEXT NOT NULL,
  blurb             TEXT NOT NULL,
  pay_verified      BOOLEAN NOT NULL DEFAULT TRUE,
  posted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(from_user_id, to_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(to_user_id, created_at);

CREATE TABLE IF NOT EXISTS interests (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, opportunity_id)
);

CREATE TABLE IF NOT EXISTS milestones (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  label      TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_milestones (
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_id  TEXT NOT NULL REFERENCES milestones(id) ON DELETE CASCADE,
  completed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, milestone_id)
);

-- Created when a thread author marks a reply helpful
-- (POST /api/threads/:id/replies/:replyId/helpful).
CREATE TABLE IF NOT EXISTS recognitions (
  id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  to_user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  text         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
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
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  text       TEXT NOT NULL,
  author_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS glossary_terms (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  term       TEXT NOT NULL,
  definition TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS learning_path_items (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  path       TEXT NOT NULL, -- starter | growing | advanced
  text       TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_map_items (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category   TEXT NOT NULL, -- e.g. Craft | Research | Collaboration
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title      TEXT NOT NULL,
  pay_range  TEXT NOT NULL,
  note       TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

