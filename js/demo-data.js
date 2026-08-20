/*
 * demo-data.js — a coherent fictional business used by "Load demo data".
 *
 * Exists so a demo or evaluation opens onto a CRM that looks lived-in:
 * a pipeline with deals at every stage, contacts tied to real-looking
 * companies, overdue and upcoming tasks. Dates are stored as offsets in days
 * and resolved at load time, so the data never looks stale.
 */
const DEMO_DATA = {
  "businessName": "Lumen Studio",
  "currency": "USD",
  "records": {
    "contacts": [
      {
        "name": "Amira Hassan",
        "email": "amira@brightbakery.example",
        "phone": "+1 555 0840",
        "company": "Bright Bakery",
        "tags": "partner",
        "notes": "Best reached after 4pm."
      },
      {
        "name": "Tom Okafor",
        "email": "tom@okaforsupplies.example",
        "phone": "+1 555 0366",
        "company": "Okafor Supplies",
        "tags": "partner",
        "notes": ""
      },
      {
        "name": "Sofia Ramirez",
        "email": "sofia@vestainteriors.example",
        "phone": "+1 555 0969",
        "company": "Vesta Interiors",
        "tags": "customer",
        "notes": "Renewal conversation due this quarter."
      },
      {
        "name": "Marcus Bell",
        "email": "marcus@northgatedental.example",
        "phone": "+1 555 0686",
        "company": "Northgate Dental",
        "tags": "customer",
        "notes": "Prefers email over phone."
      },
      {
        "name": "Priya Nair",
        "email": "priya@coastalroasters.example",
        "phone": "+1 555 0521",
        "company": "Coastal Roasters",
        "tags": "prospect",
        "notes": "Prefers email over phone."
      },
      {
        "name": "Diego Castillo",
        "email": "diego@trellisland.example",
        "phone": "+1 555 0205",
        "company": "Trellis Landscaping",
        "tags": "customer",
        "notes": "Renewal conversation due this quarter."
      },
      {
        "name": "Hannah Weiss",
        "email": "hannah@pilcrowpress.example",
        "phone": "+1 555 0585",
        "company": "Pilcrow Press",
        "tags": "supplier",
        "notes": "Introduced by an existing client."
      },
      {
        "name": "Yusuf Demir",
        "email": "yusuf@marlowfitness.example",
        "phone": "+1 555 0521",
        "company": "Marlow Fitness",
        "tags": "customer",
        "notes": "Best reached after 4pm."
      },
      {
        "name": "Elena Petrova",
        "email": "elena@juniperpeds.example",
        "phone": "+1 555 0424",
        "company": "Juniper Pediatrics",
        "tags": "partner",
        "notes": ""
      },
      {
        "name": "Nathan Cole",
        "email": "nathan@steadfastplumbing.example",
        "phone": "+1 555 0443",
        "company": "Steadfast Plumbing",
        "tags": "customer",
        "notes": "Introduced by an existing client."
      },
      {
        "name": "Keisha Johnson",
        "email": "keisha@auroraoptical.example",
        "phone": "+1 555 0194",
        "company": "Aurora Optical",
        "tags": "partner",
        "notes": "Wants a quote for next season."
      },
      {
        "name": "Andre Laurent",
        "email": "andre@fernhillnursery.example",
        "phone": "+1 555 0924",
        "company": "Fernhill Nursery",
        "tags": "past customer",
        "notes": "Introduced by an existing client."
      },
      {
        "name": "Mei Chen",
        "email": "mei@belmontlegal.example",
        "phone": "+1 555 0514",
        "company": "Belmont Legal",
        "tags": "customer",
        "notes": "Best reached after 4pm."
      },
      {
        "name": "Jonas Berg",
        "email": "jonas@kestrelcycles.example",
        "phone": "+1 555 0686",
        "company": "Kestrel Cycles",
        "tags": "customer",
        "notes": "Prefers email over phone."
      },
      {
        "name": "Rosa Alvarez",
        "email": "rosa@harborseafood.example",
        "phone": "+1 555 0306",
        "company": "Harbor Seafood Co.",
        "tags": "customer",
        "notes": "Prefers email over phone."
      },
      {
        "name": "Ibrahim Diallo",
        "email": "ibrahim@lanternbooks.example",
        "phone": "+1 555 0294",
        "company": "Lantern Books",
        "tags": "customer",
        "notes": ""
      },
      {
        "name": "Clara Whitfield",
        "email": "clara@ridgewayroofing.example",
        "phone": "+1 555 0882",
        "company": "Ridgeway Roofing",
        "tags": "customer",
        "notes": "Renewal conversation due this quarter."
      },
      {
        "name": "Devon Park",
        "email": "devon@saltandcedar.example",
        "phone": "+1 555 0806",
        "company": "Salt & Cedar Spa",
        "tags": "customer",
        "notes": "Best reached after 4pm."
      },
      {
        "name": "Anika Sharma",
        "email": "anika@uniontap.example",
        "phone": "+1 555 0738",
        "company": "Union Tap House",
        "tags": "customer",
        "notes": "Prefers email over phone."
      },
      {
        "name": "Felix Braun",
        "email": "felix@clearwaterlabs.example",
        "phone": "+1 555 0373",
        "company": "Clearwater Labs",
        "tags": "partner",
        "notes": "Best reached after 4pm."
      },
      {
        "name": "Naomi Osei",
        "email": "naomi@brightbakery.example",
        "phone": "+1 555 0979",
        "company": "Bright Bakery",
        "tags": "past customer",
        "notes": "Best reached after 4pm."
      },
      {
        "name": "Owen Kelly",
        "email": "owen@okaforsupplies.example",
        "phone": "+1 555 0687",
        "company": "Okafor Supplies",
        "tags": "customer",
        "notes": "Prefers email over phone."
      },
      {
        "name": "Leila Haddad",
        "email": "leila@vestainteriors.example",
        "phone": "+1 555 0113",
        "company": "Vesta Interiors",
        "tags": "past customer",
        "notes": ""
      },
      {
        "name": "Grant Foster",
        "email": "grant@northgatedental.example",
        "phone": "+1 555 0732",
        "company": "Northgate Dental",
        "tags": "customer",
        "notes": "Renewal conversation due this quarter."
      },
      {
        "name": "Simone Dubois",
        "email": "simone@coastalroasters.example",
        "phone": "+1 555 0240",
        "company": "Coastal Roasters",
        "tags": "partner",
        "notes": ""
      },
      {
        "name": "Rafael Moreno",
        "email": "rafael@trellisland.example",
        "phone": "+1 555 0443",
        "company": "Trellis Landscaping",
        "tags": "supplier",
        "notes": ""
      },
      {
        "name": "Ingrid Lindqvist",
        "email": "ingrid@pilcrowpress.example",
        "phone": "+1 555 0558",
        "company": "Pilcrow Press",
        "tags": "customer",
        "notes": ""
      },
      {
        "name": "Malik Yates",
        "email": "malik@marlowfitness.example",
        "phone": "+1 555 0380",
        "company": "Marlow Fitness",
        "tags": "supplier",
        "notes": "Introduced by an existing client."
      },
      {
        "name": "Vera Novak",
        "email": "vera@juniperpeds.example",
        "phone": "+1 555 0260",
        "company": "Juniper Pediatrics",
        "tags": "customer",
        "notes": "Introduced by an existing client."
      },
      {
        "name": "Colin Reid",
        "email": "colin@steadfastplumbing.example",
        "phone": "+1 555 0823",
        "company": "Steadfast Plumbing",
        "tags": "past customer",
        "notes": "Prefers email over phone."
      },
      {
        "name": "Dahlia Amari",
        "email": "dahlia@auroraoptical.example",
        "phone": "+1 555 0806",
        "company": "Aurora Optical",
        "tags": "customer",
        "notes": "Wants a quote for next season."
      },
      {
        "name": "Emeka Nwosu",
        "email": "emeka@fernhillnursery.example",
        "phone": "+1 555 0538",
        "company": "Fernhill Nursery",
        "tags": "customer",
        "notes": "Best reached after 4pm."
      },
      {
        "name": "June Tanaka",
        "email": "june@belmontlegal.example",
        "phone": "+1 555 0219",
        "company": "Belmont Legal",
        "tags": "supplier",
        "notes": "Prefers email over phone."
      },
      {
        "name": "Theo Vance",
        "email": "theo@kestrelcycles.example",
        "phone": "+1 555 0631",
        "company": "Kestrel Cycles",
        "tags": "customer",
        "notes": "Introduced by an existing client."
      },
      {
        "name": "Bianca Rossi",
        "email": "bianca@harborseafood.example",
        "phone": "+1 555 0276",
        "company": "Harbor Seafood Co.",
        "tags": "customer",
        "notes": "Prefers email over phone."
      },
      {
        "name": "Sean Doyle",
        "email": "sean@lanternbooks.example",
        "phone": "+1 555 0217",
        "company": "Lantern Books",
        "tags": "past customer",
        "notes": "Renewal conversation due this quarter."
      },
      {
        "name": "Noor Rahman",
        "email": "noor@ridgewayroofing.example",
        "phone": "+1 555 0102",
        "company": "Ridgeway Roofing",
        "tags": "past customer",
        "notes": ""
      },
      {
        "name": "Wendell Pike",
        "email": "wendell@saltandcedar.example",
        "phone": "+1 555 0917",
        "company": "Salt & Cedar Spa",
        "tags": "customer",
        "notes": ""
      },
      {
        "name": "Cora Sandoval",
        "email": "cora@uniontap.example",
        "phone": "+1 555 0847",
        "company": "Union Tap House",
        "tags": "prospect",
        "notes": "Introduced by an existing client."
      },
      {
        "name": "Luis Marsh",
        "email": "luis@clearwaterlabs.example",
        "phone": "+1 555 0643",
        "company": "Clearwater Labs",
        "tags": "past customer",
        "notes": ""
      }
    ],
    "companies": [
      {
        "name": "Bright Bakery",
        "industry": "Food & Beverage",
        "website": "https://brightbakery.example",
        "city": "Portland",
        "phone": "+1 555 0155",
        "notes": ""
      },
      {
        "name": "Okafor Supplies",
        "industry": "Manufacturing",
        "website": "https://okaforsupplies.example",
        "city": "Detroit",
        "phone": "+1 555 0955",
        "notes": ""
      },
      {
        "name": "Vesta Interiors",
        "industry": "Services",
        "website": "https://vestainteriors.example",
        "city": "Austin",
        "phone": "+1 555 0783",
        "notes": ""
      },
      {
        "name": "Northgate Dental",
        "industry": "Services",
        "website": "https://northgatedental.example",
        "city": "Seattle",
        "phone": "+1 555 0268",
        "notes": ""
      },
      {
        "name": "Coastal Roasters",
        "industry": "Food & Beverage",
        "website": "https://coastalroasters.example",
        "city": "San Diego",
        "phone": "+1 555 0220",
        "notes": ""
      },
      {
        "name": "Trellis Landscaping",
        "industry": "Services",
        "website": "https://trellisland.example",
        "city": "Denver",
        "phone": "+1 555 0566",
        "notes": ""
      },
      {
        "name": "Pilcrow Press",
        "industry": "Manufacturing",
        "website": "https://pilcrowpress.example",
        "city": "Chicago",
        "phone": "+1 555 0670",
        "notes": ""
      },
      {
        "name": "Marlow Fitness",
        "industry": "Services",
        "website": "https://marlowfitness.example",
        "city": "Boston",
        "phone": "+1 555 0441",
        "notes": ""
      },
      {
        "name": "Juniper Pediatrics",
        "industry": "Services",
        "website": "https://juniperpeds.example",
        "city": "Minneapolis",
        "phone": "+1 555 0112",
        "notes": ""
      },
      {
        "name": "Steadfast Plumbing",
        "industry": "Services",
        "website": "https://steadfastplumbing.example",
        "city": "Phoenix",
        "phone": "+1 555 0174",
        "notes": ""
      },
      {
        "name": "Aurora Optical",
        "industry": "Retail",
        "website": "https://auroraoptical.example",
        "city": "Portland",
        "phone": "+1 555 0687",
        "notes": ""
      },
      {
        "name": "Fernhill Nursery",
        "industry": "Retail",
        "website": "https://fernhillnursery.example",
        "city": "Raleigh",
        "phone": "+1 555 0865",
        "notes": ""
      },
      {
        "name": "Belmont Legal",
        "industry": "Services",
        "website": "https://belmontlegal.example",
        "city": "New York",
        "phone": "+1 555 0211",
        "notes": ""
      },
      {
        "name": "Kestrel Cycles",
        "industry": "Retail",
        "website": "https://kestrelcycles.example",
        "city": "Boulder",
        "phone": "+1 555 0195",
        "notes": ""
      },
      {
        "name": "Harbor Seafood Co.",
        "industry": "Food & Beverage",
        "website": "https://harborseafood.example",
        "city": "Baltimore",
        "phone": "+1 555 0440",
        "notes": ""
      },
      {
        "name": "Lantern Books",
        "industry": "Retail",
        "website": "https://lanternbooks.example",
        "city": "Providence",
        "phone": "+1 555 0363",
        "notes": ""
      },
      {
        "name": "Ridgeway Roofing",
        "industry": "Services",
        "website": "https://ridgewayroofing.example",
        "city": "Nashville",
        "phone": "+1 555 0758",
        "notes": ""
      },
      {
        "name": "Salt & Cedar Spa",
        "industry": "Services",
        "website": "https://saltandcedar.example",
        "city": "Santa Fe",
        "phone": "+1 555 0187",
        "notes": ""
      },
      {
        "name": "Union Tap House",
        "industry": "Food & Beverage",
        "website": "https://uniontap.example",
        "city": "Milwaukee",
        "phone": "+1 555 0778",
        "notes": ""
      },
      {
        "name": "Clearwater Labs",
        "industry": "Technology",
        "website": "https://clearwaterlabs.example",
        "city": "Madison",
        "phone": "+1 555 0899",
        "notes": ""
      }
    ],
    "deals": [
      {
        "title": "Bright Bakery — Website redesign",
        "value": 12000,
        "stage": "Proposal",
        "closeDate": {
          "__rel": 14
        },
        "contact": "Amira Hassan",
        "notes": ""
      },
      {
        "title": "Northgate Dental — Brand identity refresh",
        "value": 8500,
        "stage": "Negotiation",
        "closeDate": {
          "__rel": 9
        },
        "contact": "Marcus Bell",
        "notes": ""
      },
      {
        "title": "Pilcrow Press — Quarterly retainer",
        "value": 4800,
        "stage": "Won",
        "closeDate": {
          "__rel": -12
        },
        "contact": "Hannah Weiss",
        "notes": ""
      },
      {
        "title": "Steadfast Plumbing — E-commerce build",
        "value": 18500,
        "stage": "Qualified",
        "closeDate": {
          "__rel": 34
        },
        "contact": "Nathan Cole",
        "notes": ""
      },
      {
        "title": "Belmont Legal — Packaging design",
        "value": 6200,
        "stage": "Lead",
        "closeDate": {
          "__rel": 47
        },
        "contact": "Mei Chen",
        "notes": ""
      },
      {
        "title": "Lantern Books — Annual supply contract",
        "value": 24000,
        "stage": "Negotiation",
        "closeDate": {
          "__rel": 6
        },
        "contact": "Ibrahim Diallo",
        "notes": ""
      },
      {
        "title": "Union Tap House — Photography package",
        "value": 3200,
        "stage": "Won",
        "closeDate": {
          "__rel": -25
        },
        "contact": "Anika Sharma",
        "notes": ""
      },
      {
        "title": "Okafor Supplies — Menu & signage refresh",
        "value": 2700,
        "stage": "Proposal",
        "closeDate": {
          "__rel": 19
        },
        "contact": "Owen Kelly",
        "notes": ""
      },
      {
        "title": "Coastal Roasters — SEO retainer",
        "value": 3600,
        "stage": "Qualified",
        "closeDate": {
          "__rel": 28
        },
        "contact": "Simone Dubois",
        "notes": ""
      },
      {
        "title": "Marlow Fitness — Storefront window fit-out",
        "value": 9400,
        "stage": "Lead",
        "closeDate": {
          "__rel": 58
        },
        "contact": "Malik Yates",
        "notes": ""
      },
      {
        "title": "Aurora Optical — Booking system rollout",
        "value": 14200,
        "stage": "Proposal",
        "closeDate": {
          "__rel": 22
        },
        "contact": "Dahlia Amari",
        "notes": ""
      },
      {
        "title": "Kestrel Cycles — Loyalty program launch",
        "value": 5100,
        "stage": "Lead",
        "closeDate": {
          "__rel": 41
        },
        "contact": "Theo Vance",
        "notes": ""
      },
      {
        "title": "Ridgeway Roofing — Trade show booth",
        "value": 7800,
        "stage": "Won",
        "closeDate": {
          "__rel": -6
        },
        "contact": "Noor Rahman",
        "notes": ""
      },
      {
        "title": "Clearwater Labs — Email marketing setup",
        "value": 2400,
        "stage": "Qualified",
        "closeDate": {
          "__rel": 16
        },
        "contact": "Luis Marsh",
        "notes": ""
      },
      {
        "title": "Vesta Interiors — Fleet vehicle wrap",
        "value": 6600,
        "stage": "Lost",
        "closeDate": {
          "__rel": -18
        },
        "contact": "Sofia Ramirez",
        "notes": ""
      },
      {
        "title": "Trellis Landscaping — Catalog print run",
        "value": 11300,
        "stage": "Negotiation",
        "closeDate": {
          "__rel": 11
        },
        "contact": "Diego Castillo",
        "notes": ""
      },
      {
        "title": "Juniper Pediatrics — Mobile app discovery",
        "value": 15750,
        "stage": "Lead",
        "closeDate": {
          "__rel": 52
        },
        "contact": "Elena Petrova",
        "notes": ""
      },
      {
        "title": "Fernhill Nursery — Point-of-sale migration",
        "value": 9900,
        "stage": "Lost",
        "closeDate": {
          "__rel": -30
        },
        "contact": "Andre Laurent",
        "notes": ""
      }
    ],
    "tasks": [
      {
        "title": "Send proposal to Bright Bakery",
        "due": {
          "__rel": -1
        },
        "priority": "High",
        "done": true,
        "notes": ""
      },
      {
        "title": "Follow up on Trellis Landscaping quote",
        "due": {
          "__rel": 0
        },
        "priority": "High",
        "done": false,
        "notes": ""
      },
      {
        "title": "Schedule kickoff call with Aurora Optical",
        "due": {
          "__rel": 1
        },
        "priority": "Medium",
        "done": false,
        "notes": ""
      },
      {
        "title": "Invoice Lantern Books for deposit",
        "due": {
          "__rel": 2
        },
        "priority": "High",
        "done": false,
        "notes": ""
      },
      {
        "title": "Share revised mockups with Bright Bakery",
        "due": {
          "__rel": 3
        },
        "priority": "Medium",
        "done": false,
        "notes": ""
      },
      {
        "title": "Confirm print specs with Trellis Landscaping",
        "due": {
          "__rel": 4
        },
        "priority": "Low",
        "done": false,
        "notes": ""
      },
      {
        "title": "Renewal check-in with Aurora Optical",
        "due": {
          "__rel": 6
        },
        "priority": "Medium",
        "done": false,
        "notes": ""
      },
      {
        "title": "Collect testimonial from Lantern Books",
        "due": {
          "__rel": 9
        },
        "priority": "Low",
        "done": false,
        "notes": ""
      },
      {
        "title": "Send onboarding pack to Bright Bakery",
        "due": {
          "__rel": 11
        },
        "priority": "Medium",
        "done": false,
        "notes": ""
      },
      {
        "title": "Review contract terms with Trellis Landscaping",
        "due": {
          "__rel": 13
        },
        "priority": "High",
        "done": false,
        "notes": ""
      },
      {
        "title": "Book site visit at Aurora Optical",
        "due": {
          "__rel": 16
        },
        "priority": "Medium",
        "done": false,
        "notes": ""
      },
      {
        "title": "Archive completed files for Lantern Books",
        "due": {
          "__rel": -4
        },
        "priority": "Low",
        "done": true,
        "notes": ""
      },
      {
        "title": "Update pricing sheet for Bright Bakery",
        "due": {
          "__rel": -8
        },
        "priority": "Low",
        "done": true,
        "notes": ""
      },
      {
        "title": "Quarterly report for Trellis Landscaping",
        "due": {
          "__rel": 21
        },
        "priority": "Medium",
        "done": false,
        "notes": ""
      }
    ],
    "leads": [
      {
        "name": "Tom Bell",
        "status": "New",
        "source": "Referral",
        "email": "tom.bell@example.com",
        "phone": "+1 555 0408",
        "notes": ""
      },
      {
        "name": "Diego Johnson",
        "status": "New",
        "source": "Website",
        "email": "diego.johnson@example.com",
        "phone": "+1 555 0779",
        "notes": ""
      },
      {
        "name": "Nathan Park",
        "status": "Contacted",
        "source": "Social media",
        "email": "nathan.park@example.com",
        "phone": "+1 555 0145",
        "notes": ""
      },
      {
        "name": "Jonas Dubois",
        "status": "Contacted",
        "source": "Referral",
        "email": "jonas.dubois@example.com",
        "phone": "+1 555 0906",
        "notes": ""
      },
      {
        "name": "Devon Nwosu",
        "status": "Qualified",
        "source": "Website",
        "email": "devon.nwosu@example.com",
        "phone": "+1 555 0127",
        "notes": ""
      },
      {
        "name": "Owen Sandoval",
        "status": "Qualified",
        "source": "Walk-in",
        "email": "owen.sandoval@example.com",
        "phone": "+1 555 0299",
        "notes": ""
      },
      {
        "name": "Rafael Castillo",
        "status": "Contacted",
        "source": "Other",
        "email": "rafael.castillo@example.com",
        "phone": "+1 555 0324",
        "notes": ""
      },
      {
        "name": "Colin Chen",
        "status": "New",
        "source": "Social media",
        "email": "colin.chen@example.com",
        "phone": "+1 555 0625",
        "notes": ""
      },
      {
        "name": "Theo Braun",
        "status": "Not a fit",
        "source": "Website",
        "email": "theo.braun@example.com",
        "phone": "+1 555 0618",
        "notes": ""
      },
      {
        "name": "Wendell Lindqvist",
        "status": "Qualified",
        "source": "Referral",
        "email": "wendell.lindqvist@example.com",
        "phone": "+1 555 0817",
        "notes": ""
      }
    ],
    "notes": [
      {
        "title": "Q3 planning — priorities",
        "date": {
          "__rel": -21
        },
        "content": "Focus on retainer conversions over one-off projects. Two clients asked about ongoing support; package it."
      },
      {
        "title": "Bright Bakery kickoff call",
        "date": {
          "__rel": -14
        },
        "content": "Wants wholesale ordering separated from retail. Deadline tied to their spring menu launch."
      },
      {
        "title": "Pricing review",
        "date": {
          "__rel": -7
        },
        "content": "Raise the base project rate next quarter. Current proposals honour existing pricing."
      },
      {
        "title": "Trade show follow-ups",
        "date": {
          "__rel": -3
        },
        "content": "Twelve cards collected. Highest intent: Kestrel Cycles and Union Tap House."
      },
      {
        "title": "Referral thank-you list",
        "date": {
          "__rel": -1
        },
        "content": "Send notes to the three clients who referred work this month."
      }
    ]
  }
};

// Replace { __rel: n } placeholders with a date n days from today (YYYY-MM-DD).
function resolveDemoDates(value) {
  if (Array.isArray(value)) return value.map(resolveDemoDates);
  if (value && typeof value === 'object') {
    if (typeof value.__rel === 'number') {
      const d = new Date();
      d.setDate(d.getDate() + value.__rel);
      return d.toISOString().slice(0, 10);
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveDemoDates(v)]));
  }
  return value;
}
