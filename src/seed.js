require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');
const { genId } = require('./lib/id');

function resetAll() {
  const tablesInOrder = [
    'recognitions',
    'interests',
    'user_milestones',
    'replies',
    'threads',
    'skills',
    'projects',
    'digest_items',
    'users',
    'circles',
    'milestones',
    'opportunities',
    'field_theme',
    'glossary_terms',
    'learning_path_items',
    'skill_map_items',
    'roles',
  ];
  for (const t of tablesInOrder) db.prepare(`DELETE FROM ${t}`).run();
}

function seedUser({ name, memberType, isGuide, role, focus }) {
  const id = genId('user');
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '-').replace(/(^-|-$)/g, '');
  const email = `${slug}@seed.kollektiv.local`;
  const randomPassword = crypto.randomBytes(24).toString('hex');
  const hash = bcrypt.hashSync(randomPassword, 10);
  db.prepare(
    `INSERT INTO users (id, name, email, password_hash, member_type, is_guide, guide_role, guide_focus)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, email, hash, memberType || 'practitioner', isGuide ? 1 : 0, role || null, focus || null);
  return id;
}

function run() {
  console.log('Resetting database...');
  resetAll();
  console.log('Seeding guides...');
  const guideDefs = [
    { name: 'Mara Ilić', role: 'Senior Product Designer, Northlight Studio', focus: 'Portfolio storytelling & career transitions' },
    { name: 'Devon Okafor', role: 'UX Research Lead, Arbor Health', focus: 'Research democratization' },
    { name: 'Priya Raman', role: 'Design Systems Lead, Fieldstone Bank', focus: 'Systems thinking for early-career designers' },
    { name: 'Sam Whitfield', role: 'Freelance Product Designer', focus: 'Freelance practice & client work' },
  ];
  const guides = {};
  for (const g of guideDefs) {
    guides[g.name] = seedUser({ name: g.name, memberType: 'practitioner', isGuide: true, role: g.role, focus: g.focus });
  }

  console.log('Seeding community members...');
  const memberNames = [
    'Jordan T.', 'Aisha K.', 'Theo R.', 'Marcus L.', 'Priya S.', 'Elena R.', 'Farah B.',
    'Theo M.', 'Nadia S.', 'Wale O.', 'Sana K.', 'Ben T.', 'Ilana P.',
  ];
  const members = {};
  for (const name of memberNames) {
    members[name] = seedUser({ name, memberType: 'emerging' });
  }
  const person = (name) => guides[name] || members[name];

  console.log('Seeding circles...');
  const circleDefs = [
    { slug: 'portfolios', name: 'Portfolios', description: 'Build, critique, and strengthen your case studies.' },
    { slug: 'ux-research', name: 'UX Research', description: 'Methods, questions, and how to make research count.' },
    { slug: 'junior-designers', name: 'Junior Designers', description: 'For people in their first one to three years.' },
    { slug: 'design-systems', name: 'Design Systems', description: 'Components, tokens, and the practice of consistency.' },
    { slug: 'healthcare-ux', name: 'Healthcare UX', description: 'Designing inside a regulated, high-stakes field.' },
    { slug: 'freelance', name: 'Freelance Practice', description: 'Pricing, contracts, and independent work.' },
  ];
  const circles = {};
  for (const c of circleDefs) {
    const id = genId('circle');
    db.prepare('INSERT INTO circles (id, slug, name, description) VALUES (?, ?, ?, ?)').run(
      id, c.slug, c.name, c.description
    );
    circles[c.slug] = id;
  }

  console.log('Seeding threads and replies...');
  const insertThread = db.prepare(
    'INSERT INTO threads (id, circle_id, author_id, title, body, created_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\', ?))'
  );
  const insertReply = db.prepare(
    'INSERT INTO replies (id, thread_id, author_id, body, is_helpful, created_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\', ?))'
  );
  const insertRecognition = db.prepare(
    'INSERT INTO recognitions (id, to_user_id, from_user_id, text) VALUES (?, ?, ?, ?)'
  );

  const threadData = [
    { circle: 'portfolios', title: 'How many case studies is "enough" for a junior portfolio?', author: 'Jordan T.', age: '-2 days',
      body: 'I keep adding more projects but it never feels like enough. Is there a number I should be aiming for?',
      replies: [
        { author: 'Mara Ilić', age: '-2 days', helpful: true, body: 'Three strong case studies beat six thin ones. Depth shows how you think — breadth mostly shows you were busy.' },
        { author: 'Priya S.', age: '-1 days', body: 'This matches what I heard in interviews too. Quality over quantity, every time.' },
      ] },
    { circle: 'portfolios', title: 'Should I include failed projects in my portfolio?', author: 'Aisha K.', age: '-5 days',
      body: 'I have a project that didn\u2019t go anywhere but I learned a lot from it. Worth including?',
      replies: [
        { author: 'Theo R.', age: '-4 days', body: 'Yes — as long as you can talk clearly about what you\u2019d do differently.' },
      ] },
    { circle: 'ux-research', title: 'Lightweight way to test with 3 users on no budget?', author: 'Marcus L.', age: '-1 days',
      body: 'My team won\u2019t pay for a research tool or recruiting. What actually works?',
      replies: [
        { author: 'Devon Okafor', age: '-1 days', helpful: true, body: 'Guerrilla testing works: sit in a coffee shop, buy someone five minutes, and watch — don\u2019t ask.' },
      ] },
    { circle: 'ux-research', title: 'How do you synthesize 10 interviews without losing the nuance?', author: 'Elena R.', age: '-4 days',
      body: 'I end up with pages of notes and no idea how to turn them into something usable.',
      replies: [
        { author: 'Farah B.', age: '-3 days', body: 'Affinity mapping saved me here — group quotes by theme before you try to summarize anything.' },
      ] },
    { circle: 'junior-designers', title: 'Is it normal to feel behind after 6 months at my first job?', author: 'Theo M.', age: '-3 days',
      body: 'Everyone around me seems so much faster and more confident. Does this get better?',
      replies: [
        { author: 'Nadia S.', age: '-2 days', body: 'Extremely normal. Six months in, you\u2019re still building pattern recognition — it compounds.' },
      ] },
    { circle: 'junior-designers', title: 'Best way to ask my manager for more feedback?', author: 'Nadia S.', age: '-6 days',
      body: 'I get "looks good" a lot and not much else. How do I ask for more without seeming needy?',
      replies: [
        { author: 'Jordan T.', age: '-5 days', body: 'Ask specific questions instead of "any feedback?" — try "what would make this stronger?"' },
      ] },
    { circle: 'design-systems', title: 'Token naming conventions — any good examples?', author: 'Wale O.', age: '-2 days',
      body: 'Our tokens are a mess of one-off names. What\u2019s worked for your teams?',
      replies: [
        { author: 'Priya Raman', age: '-1 days', helpful: true, body: 'Name by role, not appearance — "color-action-primary," not "color-green." It survives rebrands.' },
      ] },
    { circle: 'design-systems', title: 'When is it too early for a team to invest in a design system?', author: 'Sana K.', age: '-7 days',
      body: 'We\u2019re a 4-person team. Worth starting one now?', replies: [] },
    { circle: 'healthcare-ux', title: 'Designing for clinicians vs. patients in the same product?', author: 'Farah B.', age: '-3 days',
      body: 'Same platform, two very different mental models and time pressures. How do you handle it?',
      replies: [
        { author: 'Devon Okafor', age: '-2 days', body: 'Treat them as genuinely separate products sharing infrastructure — don\u2019t compromise either flow for the other.' },
      ] },
    { circle: 'healthcare-ux', title: 'Resources for learning healthcare-specific design constraints?', author: 'Ben T.', age: '-7 days',
      body: 'Coming from consumer apps — where do I start?', replies: [] },
    { circle: 'freelance', title: 'How do you price a discovery-phase engagement?', author: 'Ilana P.', age: '-2 days',
      body: 'Hourly feels wrong for this phase but I don\u2019t know what else to do.',
      replies: [
        { author: 'Sam Whitfield', age: '-1 days', helpful: true, body: 'Price the phase, not the hours — clients need to know the number before they say yes.' },
      ] },
    { circle: 'freelance', title: 'Contract red flags you watch for now that you didn\u2019t as a beginner?', author: 'Marcus L.', age: '-5 days',
      body: 'Curious what experience has taught you to look out for.',
      replies: [
        { author: 'Sam Whitfield', age: '-4 days', body: 'Vague scope language — "and other related tasks as needed" has cost me real hours.' },
      ] },
  ];

  for (const t of threadData) {
    const threadId = genId('thread');
    const circleId = circles[t.circle];
    const authorId = person(t.author);
    insertThread.run(threadId, circleId, authorId, t.title, t.body, t.age);

    for (const r of t.replies) {
      const replyId = genId('reply');
      const replyAuthorId = person(r.author);
      insertReply.run(replyId, threadId, replyAuthorId, r.body, r.helpful ? 1 : 0, r.age);
      if (r.helpful) {
        const circleName = circleDefs.find((c) => c.slug === t.circle).name;
        insertRecognition.run(
          genId('recog'),
          replyAuthorId,
          authorId,
          `Marked as a helpful answer in ${circleName}.`
        );
      }
    }
  }

  console.log('Seeding opportunities...');
  const opportunities = [
    { title: 'Junior Product Designer', company: 'Northlight Studio', type: 'Full-time', location: 'Remote (US)', pay: '$65k\u2013$78k', blurb: 'Small studio, high mentorship, portfolio-first hiring.' },
    { title: 'UX Research Intern', company: 'Arbor Health', type: 'Internship', location: 'Hybrid \u2014 Austin, TX', pay: '$28/hr', blurb: '10-week paid summer research internship.' },
    { title: 'Product Designer', company: 'Fieldstone Bank', type: 'Full-time', location: 'Remote (US)', pay: '$95k\u2013$118k', blurb: 'Mid-level role, design systems heavy.' },
    { title: 'Design Systems Contractor', company: 'Coastline Media', type: 'Freelance', location: 'Remote', pay: '$75/hr', blurb: '3-month contract to rebuild the component library.' },
    { title: 'Redesign an Onboarding Flow', company: 'Trailhead Labs', type: 'Paid Challenge', location: 'Remote', pay: '$500 flat', blurb: '2-week sponsored brief, judged by Guides.' },
    { title: 'UX Researcher', company: 'Greenline Civic Tech', type: 'Full-time', location: 'Remote (US)', pay: '$88k\u2013$105k', blurb: 'Nonprofit civic tech, mission-driven team.' },
    { title: 'Design Fellow', company: 'Everbright Nonprofit Alliance', type: 'Fellowship', location: 'Hybrid \u2014 Chicago, IL', pay: '$24/hr', blurb: '6-month fellowship paired with a senior mentor.' },
    { title: 'Freelance Product Designer', company: 'Lumen Wellness', type: 'Freelance', location: 'Remote', pay: '$60\u2013$90/hr', blurb: 'Ongoing part-time engagement, about 10 hrs/week.' },
    { title: 'Junior UX Designer', company: 'Everbright Nonprofit Alliance', type: 'Apprenticeship', location: 'Hybrid \u2014 Chicago, IL', pay: '$22/hr', blurb: '12-month apprenticeship with a structured curriculum.' },
  ];
  const insertOpp = db.prepare(
    'INSERT INTO opportunities (id, title, company, type, location, pay, blurb, pay_verified) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
  );
  for (const o of opportunities) {
    insertOpp.run(genId('opp'), o.title, o.company, o.type, o.location, o.pay, o.blurb);
  }

  console.log('Seeding milestones...');
  const milestones = [
    { id: 'm1', label: 'Complete the Product Design starter path' },
    { id: 'm2', label: 'Post your first question or comment in a Circle' },
    { id: 'm3', label: 'Add your first project to your profile' },
    { id: 'm4', label: 'Get one piece of feedback from the community' },
    { id: 'm5', label: 'Express interest in an opportunity' },
  ];
  const insertMilestone = db.prepare('INSERT INTO milestones (id, label, sort_order) VALUES (?, ?, ?)');
  milestones.forEach((m, i) => insertMilestone.run(m.id, m.label, i));

  console.log('Seeding field theme, digest, glossary, learning paths, skill map, roles...');
  db.prepare(
    `INSERT INTO field_theme (id, name, guide_text, critique_text, challenge_text, circle_slug)
     VALUES ('current', ?, ?, ?, ?, ?)`
  ).run(
    'Portfolio Storytelling',
    'How to structure a case study people actually read',
    'Live critique, hosted by Mara Ili\u0107, in the Portfolios circle',
    'Rewrite one case study using a problem \u2192 process \u2192 impact structure',
    'portfolios'
  );

  const digest = [
    { text: 'AI prototyping tools are collapsing the gap between idea and testable screen — but judgment about what to test still comes from you.', author: 'Mara Ilić' },
    { text: 'More teams want design judgment backed by research rigor. Usability testing is turning into a baseline skill, not a specialty.', author: 'Devon Okafor' },
    { text: 'Design systems work is quietly becoming one of the most in-demand mid-level specializations.', author: 'Priya Raman' },
  ];
  const insertDigest = db.prepare('INSERT INTO digest_items (id, text, author_id, sort_order) VALUES (?, ?, ?, ?)');
  digest.forEach((d, i) => insertDigest.run(genId('digest'), d.text, person(d.author), i));

  const glossary = [
    { term: 'Heuristic evaluation', definition: 'A structured review of a design against known usability principles, done without users.' },
    { term: 'Information architecture', definition: 'How content and features are organized so people can find their way around.' },
    { term: 'Design system', definition: 'A shared library of components and rules that keep a product consistent.' },
    { term: 'Jobs-to-be-done', definition: 'A way of understanding what someone is really trying to accomplish, not just what they click.' },
    { term: 'Usability testing', definition: 'Watching real people try to use something to see where they struggle.' },
    { term: 'Wireframe', definition: 'A simple, low-detail sketch of a screen\u2019s layout before visual design is added.' },
  ];
  const insertGlossary = db.prepare('INSERT INTO glossary_terms (id, term, definition, sort_order) VALUES (?, ?, ?, ?)');
  glossary.forEach((g, i) => insertGlossary.run(genId('gloss'), g.term, g.definition, i));

  const learningPaths = {
    starter: ['Learn the core vocabulary of the field', 'Study three portfolios you admire and note why they work', 'Complete one small redesign exercise', 'Post your first question in a Circle', 'Ask for one piece of feedback on something you made'],
    growing: ['Run a real usability test with 3\u20135 people', 'Build a case study that shows your thinking, not just your screens', 'Give feedback in a live critique session', 'Start a small personal design system', 'Talk to a working designer about their path'],
    advanced: ['Mentor someone earlier in the field', 'Take on a paid field challenge', 'Pick a specialty: research, systems, or strategy', 'Share your point of view — write or speak about it', 'Build a body of work that shows range'],
  };
  const insertLP = db.prepare('INSERT INTO learning_path_items (id, path, text, sort_order) VALUES (?, ?, ?, ?)');
  for (const path of Object.keys(learningPaths)) {
    learningPaths[path].forEach((text, i) => insertLP.run(genId('lp'), path, text, i));
  }

  const skillMap = {
    Craft: ['Visual design', 'Interaction design', 'Prototyping', 'Design systems'],
    Research: ['User interviews', 'Usability testing', 'Synthesis & insights', 'Journey mapping'],
    Collaboration: ['Stakeholder storytelling', 'Cross-functional teamwork', 'Systems thinking', 'Giving & receiving feedback'],
  };
  const insertSkillMap = db.prepare('INSERT INTO skill_map_items (id, category, name, sort_order) VALUES (?, ?, ?, ?)');
  for (const cat of Object.keys(skillMap)) {
    skillMap[cat].forEach((name, i) => insertSkillMap.run(genId('sm'), cat, name, i));
  }

  const roles = [
    { title: 'Junior / Associate Product Designer', payRange: '$60k\u2013$80k', note: 'Usually the first paid design role — heavy on execution and learning systems.' },
    { title: 'Product Designer', payRange: '$85k\u2013$120k', note: 'Owns a feature or product area end to end.' },
    { title: 'Senior Product Designer', payRange: '$120k\u2013$160k', note: 'Sets direction across a product area and mentors juniors.' },
    { title: 'UX Researcher', payRange: '$90k\u2013$130k', note: 'A specialist track for people who love the \u201cwhy.\u201d' },
    { title: 'Design Lead / Manager', payRange: '$140k\u2013$190k', note: 'Leads people and shapes design practice, not just individual work.' },
  ];
  const insertRole = db.prepare('INSERT INTO roles (id, title, pay_range, note, sort_order) VALUES (?, ?, ?, ?, ?)');
  roles.forEach((r, i) => insertRole.run(genId('role'), r.title, r.payRange, r.note, i));

  console.log('Done. Seeded:');
  console.log(`  ${guideDefs.length} guides, ${memberNames.length} community members`);
  console.log(`  ${circleDefs.length} circles, ${threadData.length} threads`);
  console.log(`  ${opportunities.length} opportunities, ${milestones.length} milestones`);
}

module.exports = { run };

// Only auto-run when invoked directly (`node src/seed.js` / `npm run seed`),
// not when required as a module by the test suites.
if (require.main === module) {
  run();
}
