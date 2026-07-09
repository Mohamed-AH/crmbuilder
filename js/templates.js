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
];
