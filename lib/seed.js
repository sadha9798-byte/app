import { getDb } from './db';
import crypto from 'crypto';
import { v4 as uuid } from 'uuid';

function hash(pw) {
  return crypto.createHash('sha256').update(pw + 'nxt-salt').digest('hex');
}

let seeded = false;
export async function ensureSeed() {
  if (seeded) return;
  const db = await getDb();
  const users = db.collection('users');
  const admin = await users.findOne({ userId: 'admin' });
  if (!admin) {
    await users.insertOne({
      id: uuid(),
      userId: 'admin',
      name: 'Super Admin',
      email: 'admin@athletixcel.com',
      mobile: '9999999999',
      role: 'Super Admin',
      password: hash('123'),
      mustChange: true,
      status: 'active',
      createdAt: new Date().toISOString(),
    });
  }
  const settings = db.collection('settings');
  const s = await settings.findOne({ key: 'company' });
  if (!s) {
    await settings.insertOne({
      key: 'company',
      name: 'Athletixcel Sports Pvt Ltd',
      brand: 'NexTurf',
      address: 'Hyderabad, Telangana, India',
      gstNumber: '36ABCDE1234F1Z5',
      phone: '+91 90000 00000',
      email: 'info@athletixcel.com',
      invoicePrefix: 'NXT',
      gstRate: 18,
      financialYear: '2026',
      invoiceCounter: 0,
    });
  }
  // Seed sports / rates
  const sportsCol = db.collection('sports');
  const sportsCount = await sportsCol.countDocuments();
  if (sportsCount === 0) {
    await sportsCol.insertMany([
      { id: uuid(), name: 'Football', ratePerHour: 1200, color: '#22c55e' },
      { id: uuid(), name: 'Cricket', ratePerHour: 1500, color: '#f59e0b' },
      { id: uuid(), name: 'Volleyball', ratePerHour: 800, color: '#3b82f6' },
      { id: uuid(), name: 'Coaching', ratePerHour: 600, color: '#8b5cf6' },
    ]);
  }
  seeded = true;
}

export { hash };
