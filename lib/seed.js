import { getDb } from './db';
import crypto from 'crypto';
import { v4 as uuid } from 'uuid';

function hash(pw) {
  return crypto.createHash('sha256').update(pw + 'nxt-salt').digest('hex');
}

const COMPANY_DEFAULTS = {
  name: 'Athletixcel Sports Pvt Ltd',
  brand: 'NexTurf',
  logoUrl: 'https://customer-assets.emergentagent.com/job_venue-management-pro-2/artifacts/4h78znjp_athletixcel-0NRPYaoJM4U16J44.avif',
  registeredAddress: 'C/O Asha Grace, Sheshachalam House, Doddagubbi, Bangalore North, Bangalore, Karnataka - 560077',
  turfAddress: 'Survey No 1/2, DS - Max Main Road, Near Doddagubbi Lake, Doddagubbi, Bengaluru Urban, Karnataka - 560077',
  // backward-compat single address
  address: 'Survey No 1/2, DS - Max Main Road, Near Doddagubbi Lake, Doddagubbi, Bengaluru Urban, Karnataka - 560077',
  phones: {
    bookings: '+91 63602 00841',
    support: '+91 88703 21177',
    coaching: '+91 87489 81178',
    business: '+91 81050 86245',
    general: '+91 97389 07139',
  },
  emails: {
    bookings: 'athletixcelsports@gmail.com',
    support: 'athletixcelsports8817@gmail.com',
    business: 'info@atletixcelsports.in',
    coaching: 'support@atletixcelsports.in',
  },
  // primary contact (shown on invoice header)
  phone: '+91 63602 00841',
  email: 'athletixcelsports@gmail.com',
  whatsapp: '+91 63602 00841',
  gstNumber: '29ABCDE1234F1Z5',
};

let seeded = false;
export async function ensureSeed() {
  if (seeded) return;
  const db = await getDb();

  // Admin user
  const users = db.collection('users');
  const admin = await users.findOne({ userId: 'admin' });
  if (!admin) {
    await users.insertOne({
      id: uuid(),
      userId: 'admin',
      name: 'Super Admin',
      email: 'admin@athletixcelsports.in',
      mobile: '+91 63602 00841',
      role: 'Super Admin',
      password: hash('123'),
      mustChange: true,
      status: 'active',
      createdAt: new Date().toISOString(),
    });
  }

  // Company settings — upsert with company defaults but preserve invoice counter/prefix
  const settings = db.collection('settings');
  await settings.updateOne(
    { key: 'company' },
    {
      $set: COMPANY_DEFAULTS,
      $setOnInsert: {
        key: 'company',
        invoicePrefix: 'NXT',
        gstRate: 18,
        financialYear: String(new Date().getFullYear()),
        invoiceCounter: 0,
      },
    },
    { upsert: true }
  );

  // Sports
  const sportsCol = db.collection('sports');
  const existing = await sportsCol.find({}).toArray();
  const wanted = [
    { name: 'Football', ratePerHour: 1200, color: '#22c55e' },
    { name: 'Cricket', ratePerHour: 1500, color: '#f59e0b' },
    { name: 'Volleyball', ratePerHour: 800, color: '#3b82f6' },
    { name: 'Coaching', ratePerHour: 600, color: '#8b5cf6' },
    { name: 'Karate', ratePerHour: 500, color: '#ef4444' },
    { name: 'Kung Fu', ratePerHour: 500, color: '#06b6d4' },
    { name: 'Others', ratePerHour: 1000, color: '#64748b' },
  ];
  for (const w of wanted) {
    if (!existing.find(e => e.name === w.name)) {
      await sportsCol.insertOne({ id: uuid(), ...w });
    }
  }
  seeded = true;
}

export { hash };
