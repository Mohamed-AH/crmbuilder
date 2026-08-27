/*
 * gen-demo-data.mjs — writes js/demo-data.js.
 *
 *   node scripts/gen-demo-data.mjs        # rewrite js/demo-data.js
 *   node scripts/gen-demo-data.mjs --dry  # print a summary, write nothing
 *
 * WHY THIS FILE EXISTS AT ALL. `CLAUDE.md` §6 said demo-data.js was generated
 * "from a Python generator" — and that generator was never in the repository.
 * So the one file nobody was allowed to hand-edit was also the one file nobody
 * could regenerate. This closes that: the data is committed (the app loads it
 * directly, with no build step) and so is the thing that produces it.
 *
 * DETERMINISTIC ON PURPOSE. Every choice comes from a seeded PRNG, so
 * re-running produces a byte-identical file and a regeneration diff shows only
 * what was actually intended. An unseeded Math.random() would make every run a
 * few hundred lines of noise and the file effectively unreviewable.
 *
 * Two conventions the loader in js/app.js depends on:
 *
 *   { "__rel": n }   a date n days from today, resolved at load time so the
 *                    business never looks stale (already existed)
 *   { "__ref": "<moduleKey>:<name>" }
 *                    a relation, resolved to the seeded record's real id
 *
 * `__ref` may only point BACKWARDS in seed order — the loader resolves in one
 * pass as it goes, so a forward reference would resolve to nothing. Seed order
 * is TEMPLATES first, then DEMO_DATA.modules in the order written here, and
 * `tests/demo.test.mjs` asserts every ref actually resolves.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

/* --------------------------------------------------------------- the PRNG */
// mulberry32: small, seeded, and good enough to shuffle a demo dataset.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260827);
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
// Money that looks quoted rather than generated: round to a sensible step.
const money = (lo, hi, step = 500) => String(int(Math.ceil(lo / step), Math.floor(hi / step)) * step);
const rel = (n) => ({ __rel: n });
/*
 * An EXACT distribution, shuffled — not repeated calls to pick().
 *
 * Weighted random left the Projects board with an empty "Review" column, which
 * on a demo screen reads as a broken board rather than a quiet week. spread()
 * takes { status: count } and produces exactly that many, so every column is
 * populated and the totals are known before the file is written.
 */
function spread(counts) {
  const out = [];
  for (const [value, n] of Object.entries(counts)) for (let i = 0; i < n; i += 1) out.push(value);
  for (let i = out.length - 1; i > 0; i -= 1) {  // Fisher-Yates, seeded
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const ref = (kind, name) => ({ __ref: `${kind}:${name}` });

/* ------------------------------------------------------------ the business
 * Lumen Studio — a small design studio. Everything below is fictional, and
 * every domain uses .example (RFC 2606) so nothing here can ever resolve to
 * somebody's real address.
 */
const COMPANIES = [
  ['Bright Bakery', 'Food & Beverage', 'Portland'],
  ['Okafor Supplies', 'Manufacturing', 'Newark'],
  ['Vesta Interiors', 'Services', 'Austin'],
  ['Northgate Dental', 'Services', 'Columbus'],
  ['Rivera Landscaping', 'Services', 'Tucson'],
  ['Perch Coffee', 'Food & Beverage', 'Seattle'],
  ['Aldridge Legal', 'Services', 'Boston'],
  ['Kestrel Fitness', 'Retail', 'Denver'],
  ['Marlow Bookshop', 'Retail', 'Providence'],
  ['Tidewater Plumbing', 'Services', 'Norfolk'],
  ['Sunbelt Roofing', 'Manufacturing', 'Phoenix'],
  ['Clearwater Optics', 'Technology', 'San Jose'],
];

const PEOPLE = [
  'Amira Hassan', 'Tom Okafor', 'Sofia Ramirez', 'Marcus Bell', 'Yuki Tanaka',
  'Priya Nair', 'Daniel Adeyemi', 'Elena Petrova', 'Josh Lindqvist', 'Fatima Zahra',
  'Owen Brennan', 'Mei Lin', 'Carlos Duarte', 'Hannah Weiss', 'Ibrahim Diallo',
  'Grace Mwangi', 'Victor Ilunga', 'Noor Al-Amin', 'Peter Novak', 'Rosa Delgado',
  'Simon Achterberg', 'Leila Farouk', 'Andre Sokolov', 'Bianca Costa',
  'Nathan Cole', 'Ruth Abebe',
];

const slugOf = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '');
const emailFor = (person, company) => `${person.split(' ')[0].toLowerCase()}@${slugOf(company)}.example`;
const phone = () => `+1 555 0${int(100, 999)}`;

/* ----------------------------------------------------------------- records */
const records = {};

records.companies = COMPANIES.map(([name, industry, city]) => ({
  name,
  industry,
  website: `https://${slugOf(name)}.example`,
  phone: phone(),
  city,
  notes: '',
}));

records.contacts = PEOPLE.map((person, i) => {
  const [company] = COMPANIES[i % COMPANIES.length];
  return {
    name: person,
    email: emailFor(person, company),
    phone: phone(),
    company,
    tags: pick(['customer', 'customer', 'partner', 'supplier', 'prospect']),
    notes: rand() < 0.25 ? pick([
      'Best reached after 4pm.',
      'Prefers email to phone.',
      'Renewal conversation due this quarter.',
      'Introduced us to two other studios.',
      'Signs off on anything over $5k.',
    ]) : '',
  };
});

const DEAL_STAGES = ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
const DEAL_WORK = ['brand refresh', 'website rebuild', 'packaging design', 'signage package',
  'annual report', 'menu redesign', 'campaign artwork', 'app icon set', 'wayfinding system',
  'brand guidelines', 'trade stand', 'product photography'];
// Fat in the middle, thin at both ends — a real pipeline shape, and every
// stage carries at least one card so no board column renders empty.
const DEAL_SPREAD = spread({ Lead: 4, Qualified: 5, Proposal: 5, Negotiation: 3, Won: 3, Lost: 2 });
records.deals = Array.from({ length: 22 }, (_, i) => {
  const [company] = COMPANIES[i % COMPANIES.length];
  const stage = DEAL_SPREAD[i];
  return {
    title: `${company} — ${pick(DEAL_WORK)}`,
    value: money(2000, 48000),
    stage,
    company,
    contact: PEOPLE[i % PEOPLE.length],
    close: rel(int(-40, 75)),
    notes: '',
  };
});

const TASK_WORK = [
  'Send revised quote', 'Chase signed proposal', 'Book kickoff call', 'Prepare moodboard',
  'Second round of edits', 'Export final assets', 'Invoice for milestone 2', 'Order print proofs',
  'Write handover notes', 'Check print colour proof', 'Schedule photography',
  'Draft scope for phase 2', 'Review supplier quote', 'Update the portfolio page',
];
// Mostly still to do, some in flight, some closed — a task list that is 46%
// "Done" reads as an archive rather than a workload.
const TASK_SPREAD = spread({ 'To do': 10, 'In progress': 8, Done: 6 });
const TASK_PRIORITY = spread({ Low: 5, Medium: 9, High: 7, Urgent: 3 });
records.tasks = Array.from({ length: 24 }, (_, i) => ({
  title: `${pick(TASK_WORK)} — ${COMPANIES[i % COMPANIES.length][0]}`,
  due: rel(int(-12, 30)),
  priority: TASK_PRIORITY[i],
  status: TASK_SPREAD[i],
  assignee: pick(['Maya', 'Daniel', 'Priya', 'Sam']),
  notes: '',
}));

records.leads = Array.from({ length: 16 }, (_, i) => {
  const person = PEOPLE[(i * 3) % PEOPLE.length];
  const [company] = COMPANIES[(i * 5) % COMPANIES.length];
  return {
    name: person,
    company,
    email: emailFor(person, company),
    source: pick(['Referral', 'Referral', 'Website', 'Website', 'Event', 'Cold outreach', 'Social']),
    status: pick(['New', 'New', 'Contacted', 'Contacted', 'Qualified', 'Unqualified']),
    notes: '',
  };
});

records.notes = [
  'Studio is at capacity until the middle of next month — quote accordingly.',
  'Print supplier put prices up 8%. Update the standard quote template.',
  'Three referrals came from Bright Bakery this quarter. Send a thank-you.',
  'Retainer clients now cover fixed costs. Anything project-based is margin.',
  'Stop quoting fixed-price on anything with more than two rounds of revision.',
  'New camera paid for itself on the Perch Coffee shoot.',
  'Two invoices past 30 days. Call before sending another reminder.',
  'Move the portfolio off the old host before renewal.',
  'Kestrel wants a retainer from the new year — draft terms.',
  'Hire question deferred to Q3. Revisit once the pipeline clears.',
].map((content, i) => ({
  title: content.split(/[.—]/)[0].trim().slice(0, 48),
  date: rel(-int(1, 45)),
  content,
}));

/* --- the two modules that carry what the dataset could not show before ---
 * Projects exercises relations (to Companies) and a currency total on a board;
 * Invoices chains a second relation (to Projects) and gives the workspace real
 * money in a second module, which is what makes §23's currency-change prompt
 * reachable from a demo.
 */
const PROJECT_STATUS = ['Discovery', 'In progress', 'Review', 'Delivered', 'On hold'];
const PROJECT_WORK = ['Brand refresh', 'Website rebuild', 'Packaging system', 'Signage package',
  'Menu redesign', 'Campaign artwork', 'Brand guidelines', 'Annual report', 'Wayfinding',
  'Product photography', 'Trade stand', 'Icon set', 'Email templates', 'Print collateral',
  'Social kit', 'Style guide'];
const PROJECT_SPREAD = spread({ Discovery: 3, 'In progress': 5, Review: 3, Delivered: 3, 'On hold': 2 });
const projects = Array.from({ length: 16 }, (_, i) => {
  const [company] = COMPANIES[i % COMPANIES.length];
  const title = `${PROJECT_WORK[i]} — ${company}`;
  return {
    name: title,
    company: ref('companies', company),
    status: PROJECT_SPREAD[i],
    budget: money(3000, 42000),
    due: rel(int(-20, 90)),
    lead: pick(['Maya', 'Daniel', 'Priya']),
    notes: '',
  };
});
records.projects = projects;

const INVOICE_STATUS = ['Draft', 'Sent', 'Paid', 'Overdue'];
const INVOICE_SPREAD = spread({ Draft: 3, Sent: 5, Paid: 7, Overdue: 3 });
records.invoices = Array.from({ length: 18 }, (_, i) => {
  const project = projects[i % projects.length];
  const status = INVOICE_SPREAD[i];
  const issued = -int(5, 80);
  return {
    number: `LS-${2026}${String(101 + i).padStart(3, '0')}`,
    project: ref('projects', project.name),
    amount: money(800, 18000, 100),
    status,
    issued: rel(issued),
    due: rel(issued + 30),
    notes: status === 'Overdue' ? 'Second reminder sent.' : '',
  };
});

/* ------------------------------------------- modules TEMPLATES cannot cover
 * Same shape as a TEMPLATES entry, because the loader hands it to the very
 * same createFromTemplate(). `relatedModuleName` is resolved to the seeded
 * module's runtime id at load time — a static file cannot know that id.
 */
const modules = [
  {
    key: 'projects',
    name: 'Projects',
    icon: 'briefcase',
    color: '#7839ee',
    defaultView: 'kanban',   // the token app.js checks — 'board' silently falls back to table
    description: 'Work in flight, from first brief to delivery.',
    fields: [
      { key: 'name', label: 'Project', type: 'text', required: true, showInList: true },
      { key: 'company', label: 'Client', type: 'relation', relatedModuleName: 'Companies', showInList: true },
      { key: 'status', label: 'Status', type: 'select', options: PROJECT_STATUS, showInList: true },
      { key: 'budget', label: 'Budget', type: 'currency', showInList: true },
      { key: 'due', label: 'Due', type: 'date', showInList: true },
      { key: 'lead', label: 'Lead', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  {
    key: 'invoices',
    name: 'Invoices',
    icon: 'receipt',
    color: '#099250',
    defaultView: 'table',
    description: 'What has been billed, and what is still outstanding.',
    fields: [
      { key: 'number', label: 'Number', type: 'text', required: true, showInList: true },
      { key: 'project', label: 'Project', type: 'relation', relatedModuleName: 'Projects', showInList: true },
      { key: 'amount', label: 'Amount', type: 'currency', showInList: true },
      { key: 'status', label: 'Status', type: 'select', options: INVOICE_STATUS, showInList: true },
      { key: 'issued', label: 'Issued', type: 'date' },
      { key: 'due', label: 'Due', type: 'date', showInList: true },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
];

/* ------------------------------------------------------------------ write */
const DEMO = { businessName: 'Lumen Studio', currency: 'USD', modules, records };

const total = Object.values(records).reduce((n, rows) => n + rows.length, 0);
const summary = Object.entries(records).map(([k, v]) => `${k}: ${v.length}`).join(', ');
const refs = JSON.stringify(records).match(/__ref/g)?.length || 0;

const header = `/*
 * demo-data.js — a coherent fictional business used by "Load demo data".
 *
 * GENERATED by scripts/gen-demo-data.mjs — do not hand-edit. Change the
 * generator and re-run it; it is seeded, so the diff shows only what moved.
 *
 * Exists so a demo or evaluation opens onto a CRM that looks lived-in: a
 * pipeline with deals at every stage, projects linked to the companies paying
 * for them, invoices linked to those projects, and overdue and upcoming work.
 *
 * Two placeholders are resolved at load time by js/app.js:
 *   { __rel: n }                  a date n days from today, so nothing goes stale
 *   { __ref: "<key>:<name>" }     a relation, to the seeded record's real id
 *
 * A __ref may only point at a module seeded EARLIER (see the generator).
 *
 * ${total} records across ${Object.keys(records).length} modules · ${refs} relations.
 */
`;

const body = `const DEMO_DATA = ${JSON.stringify(DEMO, null, 2)};

// Replace { __rel: n } placeholders with a date n days from today (YYYY-MM-DD).
// { __ref: … } objects pass through untouched — js/app.js resolves those once
// the records they point at have real ids.
function resolveDemoDates(value) {
  if (Array.isArray(value)) return value.map(resolveDemoDates);
  if (value && typeof value === 'object') {
    if (typeof value.__rel === 'number') {
      const d = new Date();
      d.setDate(d.getDate() + value.__rel);
      return d.toISOString().slice(0, 10);
    }
    if (typeof value.__ref === 'string') return value;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveDemoDates(v)]));
  }
  return value;
}
`;

if (DRY) {
  console.log(`${summary}\ntotal: ${total} records · ${refs} relations · ${modules.length} custom modules`);
} else {
  const out = path.join(ROOT, 'js', 'demo-data.js');
  writeFileSync(out, header + body);
  console.log(`wrote ${out}\n  ${summary}\n  total: ${total} records · ${refs} relations`);
}
