// Hits a live instance of the API (must already be running) and walks through
// real user journeys end to end: signup, profile edits, circles, opportunities,
// milestones, the helpful/recognition flow, and authorization edge cases.
//
// Reseeds the database directly before running, so this suite's expectations
// (exact thread/opportunity counts, etc.) hold regardless of what ran before it.
const BASE = process.env.API_BASE || 'http://localhost:3000';
let passed = 0;

function ok(cond, msg) {
  if (!cond) throw new Error('FAILED: ' + msg);
  passed++;
  console.log('OK:', msg);
}

async function api(method, path, { body, token, expectStatus } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  // Read the body once as text, then try to parse it as JSON. This still
  // handles empty bodies (e.g. 204s) cleanly, but also keeps the raw text
  // around so a non-JSON response (an HTML error page, a stack trace) shows
  // up in the failure message below instead of silently becoming null.
  const raw = await res.text();
  let json = null;
  if (raw) {
    try {
      json = JSON.parse(raw);
    } catch (e) {
      /* non-JSON body; json stays null, raw is still reported on failure */
    }
  }
  if (expectStatus !== undefined && res.status !== expectStatus) {
    throw new Error(
      `FAILED: ${method} ${path} expected status ${expectStatus}, got ${res.status}. Body: ${json !== null ? JSON.stringify(json) : raw}`
    );
  }
  return { status: res.status, json };
}

async function run() {
  // Reseed first and wait for it to finish. Without this `await`, the
  // requests below can start firing before the database has finished
  // reseeding — the exact order-dependent flakiness this suite is meant
  // to avoid. It also means a seed failure surfaces through the same
  // run().catch() below instead of an unhandled rejection.
  await require('../src/seed').run();

  // --- health ---
  const health = await api('GET', '/api/health', { expectStatus: 200 });
  ok(health.json.ok === true, 'health check responds');

  // --- signup / login / me ---
  const email = `amara.${Date.now()}@example.com`;
  const signup = await api('POST', '/api/auth/signup', {
    body: { name: 'Amara Chen', email, password: 'correct-horse-battery', memberType: 'emerging' },
    expectStatus: 201,
  });
  ok(signup.json.token && signup.json.user.name === 'Amara Chen', 'signup returns token + user');
  const token = signup.json.token;
  const userId = signup.json.user.id;

  const dupe = await api('POST', '/api/auth/signup', {
    body: { name: 'Amara Chen', email, password: 'whatever12345' },
    expectStatus: 409,
  });
  ok(dupe.json.error, 'duplicate signup rejected with 409');

  const badSignup = await api('POST', '/api/auth/signup', {
    body: { name: '', email: 'not-an-email', password: 'short' },
    expectStatus: 400,
  });
  ok(Array.isArray(badSignup.json.error.details) && badSignup.json.error.details.length > 0, 'invalid signup returns field-level errors');

  const wrongLogin = await api('POST', '/api/auth/login', {
    body: { email, password: 'totally-wrong' },
    expectStatus: 401,
  });
  ok(wrongLogin.json.error, 'wrong password rejected with 401');

  const login = await api('POST', '/api/auth/login', {
    body: { email, password: 'correct-horse-battery' },
    expectStatus: 200,
  });
  ok(login.json.token, 'login succeeds and returns a token');

  const noAuth = await api('GET', '/api/users/me', { expectStatus: 401 });
  ok(noAuth.json.error, 'protected route without token returns 401');

  const me = await api('GET', '/api/users/me', { token, expectStatus: 200 });
  ok(me.json.memberType === 'emerging', 'profile bundle has correct memberType');
  ok(Array.isArray(me.json.milestones) && me.json.milestones.length === 5, 'profile bundle includes all 5 milestones, none completed yet');
  ok(me.json.milestones.every((m) => m.completed === false), 'fresh user has no completed milestones');
  ok(Array.isArray(me.json.contributions) && me.json.contributions.length === 0, 'fresh user has no contributions yet');

  // --- profile update ---
  const patched = await api('PATCH', '/api/users/me', {
    token,
    body: { goal: 'Land my first product design role', targetRole: 'Junior Product Designer', workPref: 'Hybrid', availability: 'Now' },
    expectStatus: 200,
  });
  ok(patched.json.goal === 'Land my first product design role', 'goal updates');
  ok(patched.json.careerGoals.workPref === 'Hybrid', 'work preference updates');

  const avatarUpdate = await api('PATCH', '/api/users/me', {
    token,
    body: { avatarUrl: 'https://example.com/avatar.png' },
    expectStatus: 200,
  });
  ok(avatarUpdate.json.avatarUrl === 'https://example.com/avatar.png', 'profile avatar URL updates');

  // --- skills ---
  const skill1 = await api('POST', '/api/users/me/skills', {
    token,
    body: { name: 'Usability testing', status: 'learning' },
    expectStatus: 201,
  });
  ok(skill1.json.name === 'Usability testing', 'skill added');
  const skill2 = await api('POST', '/api/users/me/skills', {
    token,
    body: { name: 'Wireframing', status: 'can_demonstrate' },
    expectStatus: 201,
  });
  await api('DELETE', `/api/users/me/skills/${skill1.json.id}`, { token, expectStatus: 204 });
  const afterSkillDelete = await api('GET', '/api/users/me', { token, expectStatus: 200 });
  ok(
    afterSkillDelete.json.skills.length === 1 && afterSkillDelete.json.skills[0].name === 'Wireframing',
    'skill removal leaves only the remaining skill'
  );

  // --- projects (should auto-complete milestone m3) ---
  const project = await api('POST', '/api/users/me/projects', {
    token,
    body: { title: 'Checkout Redesign', description: 'Reduced drop-off in a multi-step checkout.', link: 'https://example.com/case-study' },
    expectStatus: 201,
  });
  ok(project.json.title === 'Checkout Redesign', 'project created');
  const afterProject = await api('GET', '/api/users/me', { token, expectStatus: 200 });
  ok(afterProject.json.milestones.find((m) => m.id === 'm3').completed === true, 'adding a project auto-completes milestone m3');

  // --- ownership: a second user cannot delete the first user's project ---
  const email2 = `theo.${Date.now()}@example.com`;
  const signup2 = await api('POST', '/api/auth/signup', {
    body: { name: 'Theo Reyes', email: email2, password: 'another-good-password' },
    expectStatus: 201,
  });
  const token2 = signup2.json.token;
  const forbiddenDelete = await api('DELETE', `/api/users/me/projects/${project.json.id}`, { token: token2, expectStatus: 403 });
  ok(forbiddenDelete.json.error, "user cannot delete another user's project");

  // --- circles ---
  const circles = await api('GET', '/api/circles', { expectStatus: 200 });
  ok(circles.json.length === 6, 'all 6 circles present');
  const portfolios = circles.json.find((c) => c.slug === 'portfolios');
  ok(portfolios.threadCount === 2, 'portfolios circle starts with 2 seeded threads');

  const threadsBefore = await api('GET', '/api/circles/portfolios/threads', { expectStatus: 200 });
  ok(threadsBefore.json.threads.length === 2, 'thread list matches seeded count');
  ok(threadsBefore.json.threads.every((t) => t.author && typeof t.author.name === 'string'), 'thread author info is present');
  ok(threadsBefore.json.threads.some((t) => t.author.isGuide === false), 'seeded threads include a non-guide author');

  const newThread = await api('POST', '/api/circles/portfolios/threads', {
    token,
    body: {
      title: 'Test: how do you handle scope creep in a case study?',
      body: 'Curious how people keep case studies focused.',
      imageUrl: 'https://example.com/post-image.png',
    },
    expectStatus: 201,
  });
  ok(newThread.json.id, 'thread created');
  ok(newThread.json.imageUrl === 'https://example.com/post-image.png', 'thread image URL persists');

  const threadLikeOn = await api('POST', `/api/threads/${newThread.json.id}/like`, { token, expectStatus: 200 });
  ok(threadLikeOn.json.liked === true && threadLikeOn.json.likeCount === 1, 'thread like toggles on');
  const threadLikeOff = await api('POST', `/api/threads/${newThread.json.id}/like`, { token, expectStatus: 200 });
  ok(threadLikeOff.json.liked === false && threadLikeOff.json.likeCount === 0, 'thread like toggles off');

  const circlesAfter = await api('GET', '/api/circles', { expectStatus: 200 });
  ok(circlesAfter.json.find((c) => c.slug === 'portfolios').threadCount === 3, 'circle thread count increments after posting');

  const meAfterThread = await api('GET', '/api/users/me', { token, expectStatus: 200 });
  ok(meAfterThread.json.milestones.find((m) => m.id === 'm2').completed === true, 'posting a thread auto-completes milestone m2');
  ok(meAfterThread.json.contributions.length === 1, 'posting a thread logs a contribution');

  // --- thread detail + reply ---
  const threadDetail = await api('GET', `/api/threads/${newThread.json.id}`, { expectStatus: 200 });
  ok(threadDetail.json.replies.length === 0, 'new thread has no replies yet');

  const reply = await api('POST', `/api/threads/${newThread.json.id}/replies`, {
    token: token2,
    body: { body: 'I usually timebox the write-up to force focus.' },
    expectStatus: 201,
  });
  ok(reply.json.author.name === 'Theo Reyes', 'reply created under the replying user');

  const replyLikeOn = await api('POST', `/api/threads/${newThread.json.id}/replies/${reply.json.id}/like`, { token, expectStatus: 200 });
  ok(replyLikeOn.json.liked === true && replyLikeOn.json.likeCount === 1, 'reply like toggles on');
  const replyLikeOff = await api('POST', `/api/threads/${newThread.json.id}/replies/${reply.json.id}/like`, { token, expectStatus: 200 });
  ok(replyLikeOff.json.liked === false && replyLikeOff.json.likeCount === 0, 'reply like toggles off');

  // --- helpful / recognition flow ---
  const notAuthorHelpful = await api('POST', `/api/threads/${newThread.json.id}/replies/${reply.json.id}/helpful`, {
    token: token2, // Theo trying to mark his own reply helpful on someone else's thread
    expectStatus: 403,
  });
  ok(notAuthorHelpful.json.error, 'only the thread author can mark a reply helpful');

  const markHelpful = await api('POST', `/api/threads/${newThread.json.id}/replies/${reply.json.id}/helpful`, {
    token, // Amara is the thread author
    body: { note: 'This is exactly the framing I needed.' },
    expectStatus: 200,
  });
  ok(markHelpful.json.isHelpful === true, 'reply marked helpful');

  const theoProfile = await api('GET', `/api/users/${signup2.json.user.id}`, { expectStatus: 200 });
  ok(
    theoProfile.json.recognitions.length === 1 && theoProfile.json.recognitions[0].text.includes('exactly the framing'),
    'marking a reply helpful creates a real recognition on the replier public profile'
  );

  // --- opportunities ---
  const allOpps = await api('GET', '/api/opportunities', { expectStatus: 200 });
  ok(allOpps.json.length === 9, 'all 9 opportunities present');
  const freelanceOpps = await api('GET', '/api/opportunities?type=Freelance', { expectStatus: 200 });
  ok(freelanceOpps.json.length === 2, 'opportunity type filter works');
  ok(allOpps.json.every((o) => o.interested === false), 'opportunities show interested:false for anonymous request');

  const oppId = allOpps.json[0].id;
  const interest1 = await api('POST', `/api/opportunities/${oppId}/interest`, { token, expectStatus: 200 });
  ok(interest1.json.interested === true, 'expressing interest toggles on');
  const interest2 = await api('POST', `/api/opportunities/${oppId}/interest`, { token, expectStatus: 200 });
  ok(interest2.json.interested === false, 'expressing interest again toggles off');
  await api('POST', `/api/opportunities/${oppId}/interest`, { token, expectStatus: 200 }); // toggle back on for milestone check

  const meAfterInterest = await api('GET', '/api/users/me', { token, expectStatus: 200 });
  ok(meAfterInterest.json.interestedOpportunityIds.includes(oppId), 'interested opportunity id appears on profile bundle');
  ok(meAfterInterest.json.milestones.find((m) => m.id === 'm5').completed === true, 'expressing interest auto-completes milestone m5');

  // --- manual milestone toggle ---
  const toggleM1 = await api('POST', '/api/users/me/milestones/m1/toggle', { token, expectStatus: 200 });
  ok(toggleM1.json.completed === true, 'manual milestone toggle works');

  // --- guides ---
  const guides = await api('GET', '/api/guides', { expectStatus: 200 });
  ok(guides.json.length === 4, 'all 4 guides present');
  ok(guides.json.every((g) => g.role && g.focus), 'guide entries include role and focus');

  // --- field content bundle ---
  const field = await api('GET', '/api/field', { expectStatus: 200 });
  ok(field.json.theme.name === 'Portfolio Storytelling', 'field theme present');
  ok(field.json.digest.length === 3, 'digest has 3 items');
  ok(field.json.glossary.length === 6, 'glossary has 6 terms');
  ok(
    field.json.learningPaths.starter.length === 5 && field.json.learningPaths.growing.length === 5 && field.json.learningPaths.advanced.length === 5,
    'all 3 learning paths have 5 items each'
  );
  ok(
    field.json.skillMap.Craft.length === 4 && field.json.skillMap.Research.length === 4 && field.json.skillMap.Collaboration.length === 4,
    'skill map has all 3 categories'
  );
  ok(field.json.roles.length === 5, 'roles reference list has 5 entries');

  // --- milestones reference list ---
  const milestonesList = await api('GET', '/api/milestones', { expectStatus: 200 });
  ok(milestonesList.json.length === 5, 'milestone reference list has 5 entries');

  // --- public profile view (no email leaked) ---
  const publicProfile = await api('GET', `/api/users/${userId}`, { expectStatus: 200 });
  ok(publicProfile.json.email === undefined, 'public profile does not expose email');
  ok(publicProfile.json.projects.length === 1, 'public profile shows projects');
  ok(publicProfile.json.careerGoals.targetRole === 'Junior Product Designer', 'public profile shows career goals');

  // --- 404s ---
  const missingUser = await api('GET', '/api/users/does-not-exist', { expectStatus: 404 });
  ok(missingUser.json.error, 'missing user returns 404');
  const missingRoute = await api('GET', '/api/not-a-real-route', { expectStatus: 404 });
  ok(missingRoute.json.error, 'unknown API route returns 404');

  console.log(`\n=== ALL ${passed} CHECKS PASSED ===`);
}

run().catch((e) => {
  console.error(e.stack || e.message);
  process.exit(1);
});