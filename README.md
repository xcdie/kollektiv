# KollektivFILE` at it.FILE` at it.

## Project layout
FILE` at it.

## Project layout


## Project layout


A real full-stack app: Express + SQLite API, and a frontend that actually
talks to it - real signup/login, real Circles discussions shared across
users, real profiles, real everything. One command runs the whole thing.

92 automated checks back this up: 53 API-level checks (`npm test`) and 39
true end-to-end checks (`npm run test:integration`) that render the actual
frontend in a real DOM and drive it against a live running server - two
independent simulated users signing up, posting, replying, marking a reply
helpful, and seeing each other's real data.

## What this is not

Code you run and deploy yourself - I can't host it at a public URL from
here. It's also intentionally the **smallest credible full-stack app**, not
a production-hardened one. Not included: email verification/password reset,
file uploads, admin tooling for opportunities/field content (seeded
directly), pagination, or automated backups. See "Going to production" below.

## Quick start

Requires Node 22+ (check with `node --version`).

```bash
npm install
cp .env.example .env
# edit .env and set a real JWT_SECRET, e.g.:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npm run seed    # creates data.db, populates guides/circles/threads/opportunities/field content
npm start        # http://localhost:3000
```

Open **http://localhost:3000** in a browser. That's the whole app - sign up,
post in a Circle, add a project, express interest in an opportunity. Open it
in a second browser (or an incognito window) and sign up as someone else to
see the shared Circles content for real.

(There's a checked-in `.npmrc` with `ignore-scripts=true`. `better-sqlite3`
ships prebuilt binaries for every platform directly in the package - nothing
needs to compile - but without this, some environments still trigger an
unnecessary `node-gyp` build attempt that can fail behind restrictive
networks. None of this project's other dependencies need install scripts.)

## Testing

```bash
npm start &          # start the server first
npm test               # 53 API-level checks
npm run test:integration  # 39 real browser-to-server checks (needs jsdom, already a devDependency)
```

## How it fits together

- **`public/index.html`** is the entire frontend - one file, vanilla JS, no
  build step. It calls the API via relative `fetch('/api/...')` requests, so
  it works with zero configuration wherever you deploy this (same-origin,
  no CORS to think about). The only thing cached client-side is the JWT,
  stored via the Claude artifact `window.storage` API if you're viewing this
  inside a Claude artifact, or you can swap that for a cookie/localStorage
  equivalent if you're running this outside that context.
- **`src/`** is the Express + SQLite API. `src/app.js` serves the API under
  `/api/*` and serves `public/` for everything else - one process, one port.
- Auth is real: JWT bearer tokens, bcrypt-hashed passwords. Guests can browse
  Field Home, Circles, and Opportunities read-only; posting, profile edits,
  and expressing interest all prompt a real sign-in.

## Auth model

JWT bearer tokens, 7-day expiry by default. Passwords are hashed with bcrypt
(cost factor 12).

## API reference

All routes are prefixed with `/api`. Request/response bodies are JSON.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | – | Liveness check |
| POST | `/auth/signup` | – | `{name, email, password, memberType?}` → `{token, user}` |
| POST | `/auth/login` | – | `{email, password}` → `{token, user}` |
| GET | `/auth/me` | required | Current user (basic fields) |
| GET | `/users/me` | required | Full profile bundle: goal, careerGoals, skills, projects, milestones, contributions, recognitions, interestedOpportunityIds |
| PATCH | `/users/me` | required | Update `{name?, goal?, targetRole?, workPref?, availability?}` |
| GET | `/users/:id` | – | Public profile (no email) |
| POST | `/users/me/skills` | required | `{name, status: "learning"\|"can_demonstrate"}` |
| DELETE | `/users/me/skills/:id` | required | Must own the skill |
| POST | `/users/me/projects` | required | `{title, description, link?}` — auto-completes milestone `m3` |
| DELETE | `/users/me/projects/:id` | required | Must own the project |
| POST | `/users/me/milestones/:id/toggle` | required | Toggle a milestone on/off manually |
| GET | `/milestones` | – | Reference list of all milestones |
| GET | `/circles` | – | All circles with live thread counts |
| GET | `/circles/:slug/threads` | – | Threads in a circle |
| POST | `/circles/:slug/threads` | required | `{title, body}` — auto-completes milestone `m2` |
| GET | `/threads/:id` | – | Thread with all replies |
| POST | `/threads/:id/replies` | required | `{body}` — auto-completes milestone `m2` |
| POST | `/threads/:id/replies/:replyId/helpful` | required | Thread author only. Marks the reply helpful and creates a real Recognition on the replier's profile |
| GET | `/opportunities?type=` | optional | List/filter opportunities. Includes `interested` flag when authenticated |
| POST | `/opportunities/:id/interest` | required | Toggle interest — auto-completes milestone `m5` |
| GET | `/guides` | – | Featured Guides |
| GET | `/field` | – | Bundle: `{theme, digest, glossary, learningPaths, skillMap, roles}` |

Errors always come back as `{"error": {"message": "...", "details": [...]}}`
with a matching HTTP status (400/401/403/404/409/413/500).

## Data model

Real relations, not a JSON blob: `users`, `skills`, `projects`, `circles`,
`threads`, `replies`, `opportunities`, `interests` (join table), `milestones`
+ `user_milestones` (join table), `recognitions`, plus reference content
tables for `field_theme`, `digest_items`, `glossary_terms`,
`learning_path_items`, `skill_map_items`, and `roles`. Full definitions in
`src/schema.sql`.

**Recognitions are real**, not floating placeholder text: they're created
when a thread author marks a reply "helpful"
(`POST /threads/:id/replies/:replyId/helpful`), attached to whoever actually
earned them. A brand-new user correctly starts with zero.

Guides are just users with `is_guide = 1` plus a `guide_role`/`guide_focus` -
a Guide is a member, not a different kind of entity.

## Going to production

- **Set a real `JWT_SECRET`** (the app refuses to start without one).
- **Lock down `ALLOWED_ORIGIN`** if you ever split the frontend onto a
  different origin than the API (not needed for the default same-origin setup).
- **CSP is disabled** in `helmet()` because `public/index.html` uses inline
  `<style>`/`<script>` and loads Google Fonts. Fine for this project's scope;
  revisit with per-request nonces if the frontend grows past one file.
- **SQLite is genuinely fine to launch with** - it's a single file, handles
  concurrent reads well, and plenty of real products run on it. Add backups:
  snapshot `data.db` on a schedule, or use
  [Litestream](https://litestream.io) to replicate it continuously.
- Moving to Postgres later means swapping `better-sqlite3` for a Postgres
  driver and adjusting SQLite-specific bits in `schema.sql`
  (`datetime('now')`, autoincrement behavior). The SQL in the route files is
  plain enough that this is a translation job, not a rewrite.
- Deploy targets that suit a single Node process with a persistent local
  file: Railway, Render, Fly.io (all support persistent volumes), or a small
  VPS with `pm2`. Avoid platforms with an ephemeral/read-only filesystem
  unless you mount a volume and point `DATABASE_FILE` at it.

## Project layout

```
public/
  index.html            the entire frontend - one file, no build step
src/
  server.js               entrypoint
  app.js                    express app: middleware, API routes, static frontend, error handler
  db.js                      better-sqlite3 connection, applies schema.sql on boot
  schema.sql
  seed.js                     populates guides, circles, threads, opportunities, field content
  lib/
    auth.js                    password hashing, JWT, requireAuth/optionalAuth middleware
    errors.js                    ApiError + asyncHandler
    validate.js                   zod request validation middleware
    serialize.js                   response shaping (camelCase, strips password_hash)
    id.js                           uuid helper
  routes/                            one file per resource
test/
  smoke.js                            53 API-level checks
  integration.js                       39 real browser-to-server checks (jsdom + live fetch)
```
