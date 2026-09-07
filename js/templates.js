/*
 * templates.js — prebuilt module templates the user can pick from
 * when composing their CRM. Field `key`s must be unique per module.
 */
const TEMPLATES = [
  {
    key: 'contacts',
    name: 'Contacts',
    icon: 'users',
    color: '#1570ef',
    description: 'People you do business with — customers, suppliers, partners.',
    fields: [
      { key: 'name', label: 'Full name', type: 'text', required: true, showInList: true },
      { key: 'email', label: 'Email', type: 'email', showInList: true },
      { key: 'phone', label: 'Phone', type: 'phone', showInList: true },
      { key: 'company', label: 'Company', type: 'text', showInList: true },
      { key: 'tags', label: 'Tags', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    samples: [
      { name: 'Amira Hassan', email: 'amira@brightbakery.com', phone: '+1 555 0132', company: 'Bright Bakery', tags: 'customer' },
      { name: 'Tom Okafor', email: 'tom@okaforsupplies.com', phone: '+1 555 0177', company: 'Okafor Supplies', tags: 'supplier' },
    ],
  },
  {
    key: 'companies',
    name: 'Companies',
    icon: 'building-2',
    color: '#0e9384',
    description: 'Organizations you work with, and everything you know about them.',
    fields: [
      { key: 'name', label: 'Company name', type: 'text', required: true, showInList: true },
      { key: 'industry', label: 'Industry', type: 'select', options: ['Retail', 'Services', 'Manufacturing', 'Technology', 'Food & Beverage', 'Other'], showInList: true },
      { key: 'website', label: 'Website', type: 'url', showInList: true },
      { key: 'phone', label: 'Phone', type: 'phone' },
      { key: 'city', label: 'City', type: 'text', showInList: true },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    samples: [
      { name: 'Bright Bakery', industry: 'Food & Beverage', website: 'https://brightbakery.example', city: 'Portland' },
    ],
  },
  {
    key: 'deals',
    name: 'Deals',
    icon: 'handshake',
    color: '#099250',
    description: 'Track sales opportunities through your pipeline, kanban style.',
    defaultView: 'kanban',
    fields: [
      { key: 'title', label: 'Deal name', type: 'text', required: true, showInList: true },
      { key: 'value', label: 'Value', type: 'currency', showInList: true },
      { key: 'stage', label: 'Stage', type: 'select', options: ['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'], showInList: true },
      { key: 'closeDate', label: 'Expected close', type: 'date', showInList: true },
      { key: 'contact', label: 'Contact', type: 'text' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    samples: [
      { title: 'Bakery website redesign', value: 2400, stage: 'Proposal', contact: 'Amira Hassan' },
      { title: 'Monthly supplies contract', value: 800, stage: 'Lead', contact: 'Tom Okafor' },
    ],
  },
  {
    key: 'tasks',
    name: 'Tasks',
    icon: 'square-check-big',
    color: '#dc6803',
    description: 'To-dos and follow-ups so nothing slips through the cracks.',
    fields: [
      { key: 'title', label: 'Task', type: 'text', required: true, showInList: true },
      { key: 'due', label: 'Due date', type: 'date', showInList: true },
      { key: 'priority', label: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'], showInList: true },
      { key: 'done', label: 'Done', type: 'checkbox', showInList: true },
      { key: 'notes', label: 'Details', type: 'textarea' },
    ],
    samples: [
      { title: 'Send proposal to Bright Bakery', priority: 'High', done: false },
    ],
  },
  {
    key: 'leads',
    name: 'Leads',
    icon: 'target',
    color: '#c11574',
    description: 'Capture and qualify potential customers before they become deals.',
    defaultView: 'kanban',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, showInList: true },
      { key: 'status', label: 'Status', type: 'select', options: ['New', 'Contacted', 'Qualified', 'Not a fit'], showInList: true },
      { key: 'source', label: 'Source', type: 'select', options: ['Referral', 'Website', 'Social media', 'Walk-in', 'Other'], showInList: true },
      { key: 'email', label: 'Email', type: 'email', showInList: true },
      { key: 'phone', label: 'Phone', type: 'phone' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    samples: [],
  },
  {
    key: 'notes',
    name: 'Notes',
    icon: 'sticky-note',
    color: '#6938ef',
    description: 'Meeting notes, ideas, and anything else worth writing down.',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true, showInList: true },
      { key: 'date', label: 'Date', type: 'date', showInList: true },
      { key: 'content', label: 'Content', type: 'textarea', showInList: true },
    ],
    samples: [],
  },
  /*
   * The one template that exists for a legal reason rather than a workflow one.
   *
   * A tenant storing their customers here is the data CONTROLLER — lawful
   * basis, consent and retention are their duties, not ours (§41). This gives
   * them somewhere to record it; it does not make the obligation ours.
   *
   * **A module, not three fields on Contacts, and that is deliberate.** Adding
   * them to the Contacts template would put three pieces of UK/EU jargon in
   * front of every new workspace in the world, change nothing for a workspace
   * that already exists (fields are per module, and only an owner may edit
   * them — §14), and force `js/demo-data.js` to be regenerated to fill them or
   * fail the "field is never filled" assertion (§34). A separate module opts
   * in, costs nothing to anyone who does not pick it, and is skipped by the
   * demo loader because it seeds no records.
   *
   * **No relation field, and this is a real constraint rather than a choice.**
   * `createFromTemplate` copies fields verbatim and does NOT bind
   * `relatedModuleName` to a runtime `relatedModule` id — only the demo loader
   * does that. A relation here would create a picker pointing at nothing,
   * which renders as plausible and empty (§36's recurring shape). The person
   * is named in text, exactly as `Deals.contact` already does.
   *
   * **Options are short because option text becomes record data.** Every row
   * stores the string and carries it into every CSV and JSON export, so
   * "Contract — needed to do business with them" would be 42 bytes per row and
   * an unreadable table cell. These are the statutory names, which is also
   * what lets somebody match a row against the ICO's own guidance. The plain
   * words live in `docs/USER-GUIDE.md`, where there is room for them.
   */
  {
    key: 'consent',
    name: 'Consent & lawful basis',
    icon: 'shield-check',
    color: '#475467',
    description: 'Why you may hold each person’s details, and where they came from.',
    fields: [
      { key: 'person', label: 'Person or company', type: 'text', required: true, showInList: true },
      { key: 'basis', label: 'Lawful basis', type: 'select', options: ['Consent', 'Contract', 'Legal obligation', 'Legitimate interests', 'Vital interests', 'Public task'], showInList: true },
      { key: 'purpose', label: 'What you use it for', type: 'text', showInList: true },
      { key: 'source', label: 'Where it came from', type: 'select', options: ['They contacted us', 'Website form', 'Referral', 'Event or meeting', 'Bought or rented list', 'Public register', 'Other'], showInList: true },
      { key: 'consentDate', label: 'Date consent given', type: 'date', showInList: true },
      { key: 'withdrawnOn', label: 'Consent withdrawn', type: 'date' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
    /*
     * Two rows, on two different bases, because confusing consent with
     * contract is the single most common mistake here — one sample of each
     * teaches the distinction that a list of six words cannot.
     *
     * No dates: `createFromTemplate` copies samples verbatim and does not
     * resolve `{ __rel: n }` (only `loadDemoData` does), so a date here would
     * have to be hard-coded and would go stale. Every other template avoids
     * dates in samples for the same reason.
     */
    samples: [
      { person: 'Amira Hassan', basis: 'Consent', purpose: 'Monthly newsletter', source: 'Website form' },
      { person: 'Okafor Supplies', basis: 'Contract', purpose: 'Invoicing and deliveries', source: 'They contacted us' },
    ],
  },
];
