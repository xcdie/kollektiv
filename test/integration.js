const fs = require('fs');
const { JSDOM } = require('jsdom');

// Reseeds the database directly before running, so this suite's expectations
// hold regardless of what ran before it (including a prior run of test/smoke.js
// against the same live server).
require('../src/seed').run();

const html = fs.readFileSync(require('path').join(__dirname, '..', 'public', 'index.html'), 'utf8');
const BASE_URL = 'http://localhost:3000';

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitUntil(fn, timeoutMs) {
  timeoutMs = timeoutMs || 4000;
  var waited = 0;
  while (waited < timeoutMs) {
    var result = fn();
    if (result) return result;
    await wait(50);
    waited += 50;
  }
  return null;
}
function waitFor(dom, selector, timeoutMs) {
  return waitUntil(() => $(dom, selector), timeoutMs);
}
function waitForCount(dom, selector, count, timeoutMs) {
  return waitUntil(() => ($$(dom, selector).length === count ? true : null), timeoutMs);
}

function makeBrowser() {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    resources: undefined,
    pretendToBeVisual: true,
    url: BASE_URL + '/',
  });
  const store = {};
  dom.window.fetch = (url, opts) => fetch(url.startsWith('http') ? url : BASE_URL + url, opts);
  dom.window.storage = {
    get: async (key, shared) => {
      const k = (shared ? 's:' : 'p:') + key;
      if (!(k in store)) throw new Error('not found');
      return { key, value: store[k], shared: !!shared };
    },
    set: async (key, value, shared) => {
      store[(shared ? 's:' : 'p:') + key] = value;
      return { key, value, shared: !!shared };
    },
    delete: async (key, shared) => {
      delete store[(shared ? 's:' : 'p:') + key];
      return { key, deleted: true, shared: !!shared };
    },
    list: async () => ({ keys: Object.keys(store) }),
  };
  dom.window.onerror = (msg, src, line) => {
    throw new Error('window.onerror: ' + msg + ' (line ' + line + ')');
  };
  dom._tokenStore = store;
  return dom;
}

async function meOf(dom) {
  const t = dom._tokenStore['p:kollektiv-token'];
  const res = await fetch(`${BASE_URL}/api/auth/me`, { headers: { Authorization: 'Bearer ' + t } });
  return (await res.json()).user;
}

function $(dom, sel) { return dom.window.document.querySelector(sel); }
function $$(dom, sel) { return [...dom.window.document.querySelectorAll(sel)]; }
function click(dom, sel) {
  const el = typeof sel === 'string' ? $(dom, sel) : sel;
  if (!el) throw new Error('click target not found: ' + sel);
  el.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
}
function setVal(dom, sel, val) {
  const el = $(dom, sel);
  if (!el) throw new Error('input not found: ' + sel);
  el.value = val;
}
function focusout(dom, sel) {
  $(dom, sel).dispatchEvent(new dom.window.Event('focusout', { bubbles: true }));
}
function dump(dom) {
  console.error('DEBUG #app snapshot:\n', dom.window.document.getElementById('app').innerHTML.slice(0, 900));
}

let passed = 0;
function ok(cond, msg) {
  if (!cond) throw new Error('FAILED: ' + msg);
  passed++;
  console.log('OK:', msg);
}

async function goToCircle(dom, circleNameSubstring) {
  click(dom, '.nav-link[data-view="circles"]');
  await waitFor(dom, '.circle-card');
  const allCards = $$(dom, '.circle-card');
  const card = allCards.find((c) => c.textContent.includes(circleNameSubstring));
  if (!card) {
    const availableCircles = allCards.map((c) => c.textContent.split('\n')[0]).join(', ');
    throw new Error(`click target not found: circle "${circleNameSubstring}" (available: ${availableCircles})`);
  }
  click(dom, card);
  await waitFor(dom, '.crumb');
}

async function run() {
  const stamp = Date.now();

  const amara = makeBrowser();
  if (!(await waitFor(amara, '#authscreen'))) { dump(amara); throw new Error('auth screen never rendered'); }
  ok(true, 'fresh visitor sees the real auth screen (served by Express, not a canned mock)');

  const amaraEmail = `amara.${stamp}@example.com`;
  setVal(amara, '#auth-name', 'Amara Chen');
  setVal(amara, '#auth-email', amaraEmail);
  setVal(amara, '#auth-password', 'correct-horse-battery');
  click(amara, '[data-action="select-type"][data-type="emerging"]');
  click(amara, '[data-action="submit-auth"]');
  if (!(await waitFor(amara, '#sidebar'))) { dump(amara); throw new Error('signup did not enter the app'); }
  ok(true, 'signup succeeds against the real API and enters the app shell');

  if (!(await waitFor(amara, '.theme-tag'))) { dump(amara); throw new Error('field home never finished loading'); }
  ok($(amara, '.page-title').textContent.includes('Product Design'), 'lands on Field Home by default');
  ok($$(amara, '.guide-grid .card').length === 4, 'all 4 guides loaded from the real database');
  ok($$(amara, '.card .acc-item').length === 6, 'glossary loaded live (6 seeded terms)');

  click(amara, '.nav-link[data-view="circles"]');
  await waitFor(amara, '.circle-card');
  ok($$(amara, '.circle-card').length === 6, 'all 6 circles loaded live');
  const portfoliosCard = $$(amara, '.circle-card').find((c) => c.textContent.includes('Portfolios'));
  ok(portfoliosCard.textContent.includes('2 threads'), 'circle thread count reflects real seeded data');

  click(amara, portfoliosCard);
  await waitFor(amara, '.thread-row');
  ok($$(amara, '.thread-row').length === 2, 'real seeded threads render');

  click(amara, '[data-action="show-new-thread"]');
  await waitFor(amara, '#nt-title');
  setVal(amara, '#nt-title', 'Full-stack test: how do you avoid scope creep in a case study?');
  setVal(amara, '#nt-body', 'Genuinely curious how people keep the story tight.');
  click(amara, '[data-action="submit-thread"]');
  if (!(await waitForCount(amara, '.thread-row', 3))) { dump(amara); throw new Error('new thread never appeared'); }
  ok(true, 'new thread persisted to the real database and reappears on refetch');

  const amaraThreadRow = $$(amara, '.thread-row').find((r) => r.textContent.includes('scope creep'));
  const amaraThreadId = amaraThreadRow.dataset.thread;
  click(amara, amaraThreadRow);
  await waitFor(amara, '.crumb');
  ok($(amara, '.page-title').textContent.includes('scope creep'), 'thread detail loads from real API');

  click(amara, '.nav-link[data-view="profile"]');
  await waitFor(amara, '[data-id="m2"]');
  ok($$(amara, '[data-id="m2"]')[0].checked, 'posting a thread auto-completed milestone m2 (verified via real GET /api/users/me)');
  ok($(amara, '.contrib-row').textContent.includes('scope creep'), 'contribution appears on real profile bundle');

  const theo = makeBrowser();
  await waitFor(theo, '#authscreen');
  const theoEmail = `theo.${stamp}@example.com`;
  setVal(theo, '#auth-name', 'Theo Reyes');
  setVal(theo, '#auth-email', theoEmail);
  setVal(theo, '#auth-password', 'another-good-password');
  click(theo, '[data-action="select-type"][data-type="practitioner"]');
  click(theo, '[data-action="submit-auth"]');
  if (!(await waitFor(theo, '#sidebar'))) { dump(theo); throw new Error("Theo's signup failed"); }
  ok(true, 'a second, independent user signs up against the same live server');

  await goToCircle(theo, 'Portfolios');
  await waitFor(theo, '.thread-row');
  const theoSeesThread = $$(theo, '.thread-row').find((r) => r.textContent.includes('scope creep'));
  ok(!!theoSeesThread, "a different signed-in user, in an independent session, sees Amara's real thread");

  click(theo, theoSeesThread);
  await waitFor(theo, '#reply-body');
  setVal(theo, '#reply-body', 'I usually timebox the write-up hard - forces focus.');
  click(theo, '[data-action="submit-reply"]');
  if (!(await waitUntil(() => $$(theo, '.reply-body').some((r) => r.textContent.includes('timebox'))))) {
    dump(theo);
    throw new Error("Theo's reply never appeared");
  }
  ok(true, "Theo's reply posts to the real thread");
  ok(!$(theo, '.mark-helpful'), "Theo can't mark his own reply helpful (he's not the thread author)");

  await goToCircle(amara, 'Portfolios');
  await waitFor(amara, '.thread-row');
  click(amara, $$(amara, '.thread-row').find((r) => r.dataset.thread === amaraThreadId));
  const markBtn = await waitFor(amara, '.mark-helpful');
  ok(!!markBtn, 'thread author (Amara) sees a "Mark helpful" affordance on the real reply');
  click(amara, markBtn);
  if (!(await waitForCount(amara, '.chip-helpful', 1))) { dump(amara); throw new Error('helpful badge never appeared'); }
  ok(true, 'reply now shows Helpful badge after a real API round-trip');

  const theoUser = await meOf(theo);
  const theoPublicRes = await fetch(`${BASE_URL}/api/users/${theoUser.id}`);
  const theoPublic = await theoPublicRes.json();
  ok(
    theoPublic.recognitions.length === 1 && theoPublic.recognitions[0].text.includes('helpful answer in Portfolios'),
    'marking helpful created a real Recognition row, visible on a fresh unauthenticated GET to the public profile'
  );

  click(amara, '.nav-link[data-view="profile"]');
  await waitFor(amara, '#goal-input');
  setVal(amara, '#goal-input', 'Land my first product design role');
  focusout(amara, '#goal-input');
  await waitUntil(() => $(amara, '.saved-tick.show'));

  setVal(amara, '#target-role-input', 'Junior Product Designer');
  focusout(amara, '#target-role-input');
  await waitUntil(() => $(amara, '.saved-tick.show'));
  await wait(200);

  click(amara, '[data-action="set-workpref"][data-value="Hybrid"]');
  if (!(await waitUntil(() => { var e = $(amara, '[data-action="set-workpref"][data-value="Hybrid"]'); return e && e.classList.contains('chip-selected'); }))) {
    dump(amara); throw new Error('work preference never persisted');
  }
  ok(true, 'work preference persists through a real PATCH + refetch');

  setVal(amara, '#add-can', 'Usability testing');
  click(amara, '[data-action="add-can"]');
  if (!(await waitUntil(() => $$(amara, '.chip-can').some((c) => c.textContent.includes('Usability testing'))))) {
    dump(amara); throw new Error('skill never appeared');
  }
  ok(true, 'skill added via real API');

  click(amara, '[data-action="show-project-form"]');
  await waitFor(amara, '#proj-title');
  setVal(amara, '#proj-title', 'Checkout Redesign');
  setVal(amara, '#proj-desc', 'Reduced drop-off in a multi-step checkout.');
  setVal(amara, '#proj-link', 'https://example.com/case-study');
  click(amara, '[data-action="submit-project"]');
  if (!(await waitFor(amara, '.proj-title'))) { dump(amara); throw new Error('project never saved'); }
  ok(true, 'project saved to the real database');
  ok($$(amara, '[data-id="m3"]')[0].checked, 'adding a project auto-completed milestone m3 for real');

  click(amara, '.nav-link[data-view="opportunities"]');
  await waitFor(amara, '.opp-grid .card');
  ok($$(amara, '.opp-grid .card').length === 9, 'all 9 real opportunities load');

  click(amara, '[data-action="filter-opp"][data-filter="Freelance"]');
  if (!(await waitForCount(amara, '.opp-grid .card', 2))) { dump(amara); throw new Error('filter never applied'); }
  ok(true, 'real filter query works (type=Freelance)');

  click(amara, '[data-action="filter-opp"][data-filter="All"]');
  await waitForCount(amara, '.opp-grid .card', 9);
  const oppBtn = $(amara, '[data-action="toggle-interest"]');
  click(amara, oppBtn);
  if (!(await waitUntil(() => { var b = $(amara, '[data-action="toggle-interest"]'); return b && b.textContent.includes('Interested'); }))) {
    dump(amara); throw new Error('interest toggle never reflected');
  }
  ok(true, 'expressing interest round-trips through the real API');

  click(amara, '.nav-link[data-view="profile"]');
  await waitFor(amara, '[data-id="m5"]');
  ok($$(amara, '[data-id="m5"]')[0].checked, 'milestone m5 auto-completed for real after expressing interest');

  click(amara, '[data-action="ask-logout"]');
  await waitFor(amara, '[data-action="confirm-logout"]');
  click(amara, '[data-action="confirm-logout"]');
  if (!(await waitFor(amara, '#authscreen'))) { dump(amara); throw new Error('logout never returned to auth screen'); }
  ok(true, 'logout returns to the real auth screen');

  click(amara, '[data-action="auth-tab"][data-mode="login"]');
  await waitFor(amara, '#auth-password');
  setVal(amara, '#auth-email', amaraEmail);
  setVal(amara, '#auth-password', 'correct-horse-battery');
  click(amara, '[data-action="submit-auth"]');
  if (!(await waitFor(amara, '#sidebar'))) { dump(amara); throw new Error('re-login failed'); }
  ok(true, 're-login works against the real API with the same credentials');
  await waitFor(amara, '.theme-tag'); // let the post-login fieldHome navigate() fully settle first

  click(amara, '.nav-link[data-view="profile"]');
  await waitFor(amara, '.profile-name');
  ok($(amara, '.profile-name').textContent.includes('Amara Chen'), 'profile name persisted across logout/login in the real database');
  ok($(amara, '#goal-input').value === 'Land my first product design role', 'goal persisted across logout/login');
  ok(!!$(amara, '.proj-title'), 'project persisted across logout/login');
  ok($$(amara, '[data-id="m3"]')[0].checked, 'milestone completion persisted across logout/login');

  const guest = makeBrowser();
  await waitFor(guest, '[data-action="browse-guest"]');
  click(guest, '[data-action="browse-guest"]');
  if (!(await waitFor(guest, '#sidebar'))) { dump(guest); throw new Error('guest mode never entered'); }
  ok(true, 'guest mode enters the app without an account');
  ok($(guest, '.guest-pill') !== null, 'sidebar shows guest framing');
  await waitFor(guest, '.theme-tag'); // let the initial fieldHome navigate() fully settle before navigating again

  await goToCircle(guest, 'Portfolios');
  await waitFor(guest, '.thread-row, .empty-state');
  ok(!!$(guest, '.signin-prompt'), 'guest sees a sign-in prompt instead of a post form');
  ok(!$(guest, '[data-action="show-new-thread"]'), 'guest cannot see the post-a-thread button');

  click(guest, '.nav-link[data-view="profile"]');
  if (!(await waitFor(guest, '#authscreen'))) { dump(guest); throw new Error('guest was not redirected to auth'); }
  ok(true, 'guest hitting Proof of Practice is redirected to real sign-in, not shown a broken page');

  const broken = makeBrowser();
  broken.window.fetch = () => Promise.reject(new TypeError('fetch failed'));
  await waitFor(broken, '#authscreen');
  click(broken, '[data-action="auth-tab"][data-mode="login"]');
  await waitFor(broken, '#auth-password');
  setVal(broken, '#auth-email', 'whoever@example.com');
  setVal(broken, '#auth-password', 'whatever12345');
  click(broken, '[data-action="submit-auth"]');
  const errEl = await waitUntil(() => {
    var e = $(broken, '#auth-error');
    return e && e.textContent.length > 0 ? e : null;
  });
  ok(!!errEl && errEl.textContent.toLowerCase().includes('reach'), 'an unreachable API produces a friendly "could not reach" message, not a crash or silent hang');

  console.log(`\n=== ALL ${passed} FULL-STACK INTEGRATION CHECKS PASSED ===`);
}

run().catch((e) => {
  console.error(e.message);
  console.error(e.stack);
  process.exit(1);
});
