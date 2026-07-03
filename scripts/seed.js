// scripts/seed.js
// Run once after first install: `node scripts/seed.js`
// Seeds the service catalog (from Marketing_Biz.xlsx) and creates the
// first admin account from ADMIN_EMAIL / ADMIN_PASSWORD in .env.
// Safe to re-run — uses INSERT OR IGNORE / ON CONFLICT.

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
const db = require('../src/db');

const services = [
  { key: 'ppc', name: 'PPC / Search Ads', complexity: 'complex',
    description: 'Search and social ad campaigns across Google, Meta, TikTok, and LinkedIn.',
    price_note: '$0.50 markup per click across all platforms' },
  { key: 'email_sms', name: 'Email + SMS Marketing', complexity: 'simple',
    description: 'Automated email/SMS sequences across the awareness-to-conversion funnel.',
    price_note: '$39.99/mo (up to 1,000 emails) or $159.99/mo (up to 10,000 emails)' },
  { key: 'social', name: 'Social Media Marketing', complexity: 'complex',
    description: 'Account setup, short-form video ads, targeted campaigns, and content creation.',
    price_note: "Editor's fee (quoted) + $15-$50/mo maintenance" },
  { key: 'website', name: 'Website Creation', complexity: 'complex',
    description: 'Full website builds, inclusive of SEO optimization.',
    price_note: 'Dev fee (quoted) + $15-$50/mo maintenance' },
  { key: 'seo', name: 'SEO Optimization', complexity: 'complex',
    description: 'Ongoing SEO for existing sites, scaled to site size and competitiveness.',
    price_note: 'From $899.99/mo' },
  { key: 'retargeting', name: 'Retargeting Ads', complexity: 'simple',
    description: 'Retarget visitors who left without converting, on the platforms they already use.',
    price_note: '$44.99/mo' },
];

const insertService = db.prepare(
  `INSERT INTO services (key, name, description, complexity, price_note)
   VALUES (@key, @name, @description, @complexity, @price_note)
   ON CONFLICT(key) DO UPDATE SET
     name = excluded.name, description = excluded.description,
     complexity = excluded.complexity, price_note = excluded.price_note`
);
for (const s of services) insertService.run(s);
console.log(`Seeded ${services.length} services.`);

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set in .env — skipping admin creation.');
    return;
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(existing.id);
    console.log(`Existing user ${email} promoted to admin.`);
    return;
  }

  const hash = await bcrypt.hash(password, 12);
  db.prepare(
    `INSERT INTO users (id, role, name, email, password_hash) VALUES (?, 'admin', ?, ?, ?)`
  ).run(randomUUID(), process.env.ADMIN_NAME || 'Admin', email.toLowerCase(), hash);
  console.log(`Admin account created: ${email}`);
}

seedAdmin().then(() => process.exit(0));
