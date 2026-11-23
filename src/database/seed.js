import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function seedDemoData(dbPath) {
  const file = dbPath || path.resolve(process.cwd(), 'fairshare.db');
  const db = new DatabaseSync(file);

  db.exec(`
    CREATE TABLE IF NOT EXISTS c4_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      members TEXT NOT NULL,
      expenses TEXT NOT NULL,
      payments TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 0,
      next_expense INTEGER NOT NULL DEFAULT 1,
      next_payment INTEGER NOT NULL DEFAULT 1
    );
  `);

  const seedMembers = [
    { id: 1, name: 'Asha' },
    { id: 2, name: 'Ben' },
    { id: 3, name: 'Charlie' },
    { id: 4, name: 'Divya' }
  ];
  const seedExpenses = [
    {
      id: 1,
      description: 'Beachside Villa Booking',
      amount: 1600000,
      paidBy: 1,
      splits: { '1': 400000, '2': 400000, '3': 400000, '4': 400000 },
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
      id: 2,
      description: 'Shack Dinner & Seafood',
      amount: 480000,
      paidBy: 2,
      splits: { '1': 120000, '2': 120000, '3': 120000, '4': 120000 },
      createdAt: new Date(Date.now() - 86400000).toISOString()
    },
    {
      id: 3,
      description: 'Scooter Rentals & Fuel',
      amount: 240000,
      paidBy: 3,
      splits: { '1': 60000, '2': 60000, '3': 60000, '4': 60000 },
      createdAt: new Date(Date.now() - 3600000 * 5).toISOString()
    }
  ];

  db.prepare(`
    INSERT OR REPLACE INTO c4_groups (id, name, members, expenses, payments, version, next_expense, next_payment)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'goa-with-the-gang-26',
    'Goa With The Gang 🌴',
    JSON.stringify(seedMembers),
    JSON.stringify(seedExpenses),
    JSON.stringify([]),
    1,
    4,
    1
  );

  console.log('Seeded demo group "goa-with-the-gang-26" successfully.');
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDemoData();
}
