import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { ensureSeed, hash } from '@/lib/seed';
import { signToken, getAuth } from '@/lib/auth';

function json(data, init = {}) {
  return NextResponse.json(data, init);
}
function err(msg, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

async function audit(userId, action, module, details = {}) {
  try {
    const db = await getDb();
    await db.collection('audit_logs').insertOne({
      id: uuid(),
      userId, action, module, details,
      at: new Date().toISOString(),
    });
  } catch (e) {}
}

async function nextInvoiceNumber() {
  const db = await getDb();
  const s = await db.collection('settings').findOneAndUpdate(
    { key: 'company' },
    { $inc: { invoiceCounter: 1 } },
    { returnDocument: 'after' }
  );
  const doc = s.value || s; // driver compat
  const counter = (doc?.invoiceCounter) || (await db.collection('settings').findOne({ key: 'company' }))?.invoiceCounter || 1;
  const year = doc?.financialYear || new Date().getFullYear();
  const prefix = doc?.invoicePrefix || 'NXT';
  return `${prefix}-${year}-${String(counter).padStart(6, '0')}`;
}

async function handler(request, { params }) {
  await ensureSeed();
  const p = (await params)?.path || [];
  const route = '/' + p.join('/');
  const method = request.method;
  const db = await getDb();

  // PUBLIC: health
  if (route === '/' || route === '/health') {
    return json({ ok: true, app: 'NexTurf ERP', time: new Date().toISOString() });
  }

  // PUBLIC: login
  if (route === '/auth/login' && method === 'POST') {
    const body = await request.json();
    const { userId, password } = body || {};
    const u = await db.collection('users').findOne({ userId });
    if (!u || u.password !== hash(password || '')) return err('Invalid credentials', 401);
    if (u.status === 'disabled') return err('Account disabled', 403);
    const token = signToken({ uid: u.id, userId: u.userId, role: u.role, name: u.name });
    await db.collection('login_logs').insertOne({
      id: uuid(), userId: u.userId, at: new Date().toISOString(),
      ip: request.headers.get('x-forwarded-for') || 'unknown',
    });
    return json({ token, user: { id: u.id, userId: u.userId, name: u.name, role: u.role, email: u.email, mustChange: u.mustChange } });
  }

  // All routes below require auth
  const auth = getAuth(request);
  if (!auth) return err('Unauthorized', 401);

  // --- AUTH ---
  if (route === '/auth/me' && method === 'GET') {
    const u = await db.collection('users').findOne({ id: auth.uid });
    if (!u) return err('Not found', 404);
    return json({ id: u.id, userId: u.userId, name: u.name, role: u.role, email: u.email, mustChange: u.mustChange });
  }
  if (route === '/auth/change-password' && method === 'POST') {
    const { oldPassword, newPassword } = await request.json();
    const u = await db.collection('users').findOne({ id: auth.uid });
    if (!u || u.password !== hash(oldPassword || '')) return err('Old password wrong', 400);
    await db.collection('users').updateOne({ id: u.id }, { $set: { password: hash(newPassword), mustChange: false } });
    return json({ ok: true });
  }

  // --- DASHBOARD ---
  if (route === '/dashboard' && method === 'GET') {
    const today = new Date(); today.setHours(0,0,0,0);
    const todayStr = today.toISOString().slice(0,10);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);

    const bookings = await db.collection('bookings').find({}).toArray();
    const invoices = await db.collection('invoices').find({}).toArray();
    const payments = await db.collection('payments').find({}).toArray();
    const customers = await db.collection('customers').find({}).sort({ createdAt: -1 }).limit(5).toArray();

    const todaysBookings = bookings.filter(b => b.bookingDate === todayStr);
    const todaysRevenue = invoices.filter(i => i.bookingDate === todayStr).reduce((s,i) => s + (i.totalAmount||0), 0);
    const monthsBookings = bookings.filter(b => b.bookingDate >= monthStart);
    const monthsRevenue = invoices.filter(i => i.bookingDate >= monthStart).reduce((s,i) => s + (i.totalAmount||0), 0);
    const outstanding = invoices.reduce((s,i) => s + ((i.totalAmount||0) - (i.paidAmount||0)), 0);

    // occupancy estimate: 16 hrs * 3 turfs = 48 hours/day capacity
    const cap = 48;
    const todayHours = todaysBookings.reduce((s,b) => s + (b.totalHours||0), 0);
    const occupancy = Math.min(100, Math.round((todayHours / cap) * 100));

    // Revenue series last 14 days
    const series = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0,10);
      const rev = invoices.filter(x => x.bookingDate === ds).reduce((s,x) => s + (x.totalAmount||0), 0);
      const bks = bookings.filter(x => x.bookingDate === ds).length;
      series.push({ date: ds.slice(5), revenue: rev, bookings: bks });
    }

    // sport split
    const sportSplit = {};
    for (const b of bookings) sportSplit[b.sport] = (sportSplit[b.sport] || 0) + 1;
    const sportData = Object.entries(sportSplit).map(([name, value]) => ({ name, value }));

    // payment split
    const paymentSplit = { Paid: 0, Partial: 0, Unpaid: 0 };
    for (const inv of invoices) {
      const paid = inv.paidAmount || 0;
      if (paid >= (inv.totalAmount||0)) paymentSplit.Paid++;
      else if (paid > 0) paymentSplit.Partial++;
      else paymentSplit.Unpaid++;
    }

    // upcoming
    const upcoming = bookings
      .filter(b => b.bookingDate >= todayStr && ['Pending','Confirmed'].includes(b.status))
      .sort((a,b) => (a.bookingDate+a.startTime).localeCompare(b.bookingDate+b.startTime))
      .slice(0, 6);

    const recentTx = payments.sort((a,b) => (b.at||'').localeCompare(a.at||'')).slice(0,6);

    return json({
      kpis: {
        todaysRevenue, todaysBookings: todaysBookings.length,
        monthsRevenue, monthsBookings: monthsBookings.length,
        outstanding, occupancy,
        availableSlots: Math.max(0, cap - todayHours),
      },
      series, sportData,
      paymentSplit: Object.entries(paymentSplit).map(([name,value]) => ({ name, value })),
      upcoming, recentTx, recentCustomers: customers,
    });
  }

  // --- SPORTS ---
  if (route === '/sports' && method === 'GET') {
    const list = await db.collection('sports').find({}).toArray();
    return json(list);
  }

  // --- CUSTOMERS ---
  if (route === '/customers' && method === 'GET') {
    const list = await db.collection('customers').find({}).sort({ createdAt: -1 }).toArray();
    return json(list);
  }
  if (route === '/customers' && method === 'POST') {
    const b = await request.json();
    const exist = b.mobile ? await db.collection('customers').findOne({ mobile: b.mobile }) : null;
    if (exist) return json(exist);
    const doc = { id: uuid(), ...b, createdAt: new Date().toISOString(), createdBy: auth.userId };
    await db.collection('customers').insertOne(doc);
    await audit(auth.userId, 'CREATE', 'customers', { id: doc.id });
    return json(doc);
  }
  if (route.startsWith('/customers/') && method === 'GET') {
    const id = route.split('/')[2];
    const c = await db.collection('customers').findOne({ id });
    if (!c) return err('Not found', 404);
    const bookings = await db.collection('bookings').find({ customerId: id }).toArray();
    const invoices = await db.collection('invoices').find({ customerId: id }).toArray();
    const payments = await db.collection('payments').find({ customerId: id }).toArray();
    const totalRevenue = invoices.reduce((s,i) => s + (i.totalAmount||0), 0);
    const totalPaid = invoices.reduce((s,i) => s + (i.paidAmount||0), 0);
    const totalHours = bookings.reduce((s,b) => s + (b.totalHours||0), 0);
    const lastBooking = bookings.sort((a,b) => (b.bookingDate||'').localeCompare(a.bookingDate||''))[0];
    return json({
      customer: c, bookings, invoices, payments,
      stats: { totalBookings: bookings.length, totalRevenue, totalPaid, pending: totalRevenue - totalPaid, totalHours, lastBookingDate: lastBooking?.bookingDate || null },
    });
  }
  if (route.startsWith('/customers/') && method === 'PUT') {
    const id = route.split('/')[2];
    const b = await request.json();
    delete b.id;
    await db.collection('customers').updateOne({ id }, { $set: b });
    await audit(auth.userId, 'UPDATE', 'customers', { id });
    return json({ ok: true });
  }
  if (route.startsWith('/customers/') && method === 'DELETE') {
    const id = route.split('/')[2];
    await db.collection('customers').deleteOne({ id });
    await audit(auth.userId, 'DELETE', 'customers', { id });
    return json({ ok: true });
  }

  // --- BOOKINGS ---
  if (route === '/bookings' && method === 'GET') {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const q = {};
    if (from && to) q.bookingDate = { $gte: from, $lte: to };
    const list = await db.collection('bookings').find(q).sort({ bookingDate: -1, startTime: -1 }).toArray();
    return json(list);
  }
  if (route === '/bookings' && method === 'POST') {
    const b = await request.json();
    // Find/create customer
    let customer = null;
    if (b.mobile) customer = await db.collection('customers').findOne({ mobile: b.mobile });
    if (!customer) {
      customer = { id: uuid(), name: b.customerName, mobile: b.mobile, email: b.email || '', address: '', gstNumber: '', createdAt: new Date().toISOString() };
      await db.collection('customers').insertOne(customer);
    }
    const start = b.startTime, end = b.endTime;
    const totalHours = computeHours(start, end);
    const rate = Number(b.ratePerHour) || 0;
    const subtotal = totalHours * rate;
    const discount = Number(b.discount) || 0;
    const taxable = Math.max(0, subtotal - discount);
    const gstRate = Number(b.gstRate ?? 18);
    const tax = +(taxable * gstRate / 100).toFixed(2);
    const totalAmount = +(taxable + tax).toFixed(2);
    const advance = Number(b.advanceAmount) || 0;
    const balance = +(totalAmount - advance).toFixed(2);

    const bookingId = `BK-${Date.now().toString().slice(-8)}`;
    const doc = {
      id: uuid(),
      bookingId,
      customerId: customer.id,
      customerName: customer.name,
      mobile: customer.mobile,
      email: customer.email,
      sport: b.sport,
      bookingDate: b.bookingDate,
      startTime: start,
      endTime: end,
      totalHours,
      ratePerHour: rate,
      discount,
      gstRate,
      tax,
      subtotal,
      totalAmount,
      advanceAmount: advance,
      balanceAmount: balance,
      paymentStatus: advance >= totalAmount ? 'Paid' : advance > 0 ? 'Partial' : 'Unpaid',
      status: b.status || 'Confirmed',
      notes: b.notes || '',
      source: b.source || 'Manual',
      createdBy: auth.userId,
      createdAt: new Date().toISOString(),
    };
    await db.collection('bookings').insertOne(doc);
    // Auto-generate invoice
    const invoiceNumber = await nextInvoiceNumber();
    const inv = {
      id: uuid(),
      invoiceNumber,
      bookingId: doc.id,
      bookingRef: doc.bookingId,
      customerId: customer.id,
      customerName: customer.name,
      mobile: customer.mobile,
      email: customer.email,
      gstNumber: customer.gstNumber || '',
      sport: doc.sport,
      bookingDate: doc.bookingDate,
      startTime: doc.startTime,
      endTime: doc.endTime,
      totalHours, ratePerHour: rate,
      subtotal, discount, gstRate, tax, totalAmount,
      paidAmount: advance,
      balance,
      isGst: !!customer.gstNumber,
      status: 'Issued',
      createdAt: new Date().toISOString(),
      createdBy: auth.userId,
    };
    await db.collection('invoices').insertOne(inv);
    if (advance > 0) {
      await db.collection('payments').insertOne({
        id: uuid(),
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        bookingId: doc.id,
        customerId: customer.id,
        customerName: customer.name,
        amount: advance,
        mode: b.paymentMode || 'Cash',
        at: new Date().toISOString(),
        notes: 'Advance at booking',
        createdBy: auth.userId,
      });
    }
    await audit(auth.userId, 'CREATE', 'bookings', { id: doc.id, invoice: invoiceNumber });
    return json({ booking: doc, invoice: inv });
  }
  if (route.startsWith('/bookings/') && method === 'PUT') {
    const id = route.split('/')[2];
    const b = await request.json();
    const update = { ...b };
    delete update.id;
    if (b.startTime && b.endTime) update.totalHours = computeHours(b.startTime, b.endTime);
    await db.collection('bookings').updateOne({ id }, { $set: update });
    await audit(auth.userId, 'UPDATE', 'bookings', { id });
    return json({ ok: true });
  }
  if (route.startsWith('/bookings/') && method === 'DELETE') {
    const id = route.split('/')[2];
    await db.collection('bookings').deleteOne({ id });
    await audit(auth.userId, 'DELETE', 'bookings', { id });
    return json({ ok: true });
  }

  // --- INVOICES ---
  if (route === '/invoices' && method === 'GET') {
    const list = await db.collection('invoices').find({}).sort({ createdAt: -1 }).toArray();
    return json(list);
  }
  if (route.startsWith('/invoices/') && method === 'GET') {
    const id = route.split('/')[2];
    const inv = await db.collection('invoices').findOne({ id });
    if (!inv) return err('Not found', 404);
    const company = await db.collection('settings').findOne({ key: 'company' });
    const payments = await db.collection('payments').find({ invoiceId: id }).toArray();
    return json({ invoice: inv, company, payments });
  }

  // --- PAYMENTS ---
  if (route === '/payments' && method === 'GET') {
    const list = await db.collection('payments').find({}).sort({ at: -1 }).toArray();
    return json(list);
  }
  if (route === '/payments' && method === 'POST') {
    const b = await request.json();
    const inv = await db.collection('invoices').findOne({ id: b.invoiceId });
    if (!inv) return err('Invoice not found', 404);
    const amount = Number(b.amount) || 0;
    const pay = {
      id: uuid(),
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      bookingId: inv.bookingId,
      customerId: inv.customerId,
      customerName: inv.customerName,
      amount,
      mode: b.mode || 'Cash',
      at: new Date().toISOString(),
      notes: b.notes || '',
      createdBy: auth.userId,
    };
    await db.collection('payments').insertOne(pay);
    const newPaid = (inv.paidAmount || 0) + amount;
    const newBal = (inv.totalAmount || 0) - newPaid;
    await db.collection('invoices').updateOne({ id: inv.id }, { $set: { paidAmount: newPaid, balance: newBal } });
    // sync booking
    const bookingPaymentStatus = newPaid >= inv.totalAmount ? 'Paid' : newPaid > 0 ? 'Partial' : 'Unpaid';
    await db.collection('bookings').updateOne({ id: inv.bookingId }, { $set: { advanceAmount: newPaid, balanceAmount: newBal, paymentStatus: bookingPaymentStatus } });
    await audit(auth.userId, 'CREATE', 'payments', { id: pay.id });
    return json(pay);
  }

  // --- EXPENSES ---
  if (route === '/expenses' && method === 'GET') {
    const list = await db.collection('expenses').find({}).sort({ date: -1 }).toArray();
    return json(list);
  }
  if (route === '/expenses' && method === 'POST') {
    const b = await request.json();
    const doc = {
      id: uuid(),
      date: b.date,
      category: b.category,
      vendor: b.vendor || '',
      description: b.description || '',
      amount: Number(b.amount) || 0,
      approvedBy: b.approvedBy || auth.userId,
      createdBy: auth.userId,
      createdAt: new Date().toISOString(),
    };
    await db.collection('expenses').insertOne(doc);
    await audit(auth.userId, 'CREATE', 'expenses', { id: doc.id });
    return json(doc);
  }
  if (route.startsWith('/expenses/') && method === 'DELETE') {
    const id = route.split('/')[2];
    await db.collection('expenses').deleteOne({ id });
    return json({ ok: true });
  }

  // --- REPORTS ---
  if (route === '/reports/pnl' && method === 'GET') {
    const url = new URL(request.url);
    const from = url.searchParams.get('from') || '1970-01-01';
    const to = url.searchParams.get('to') || '2999-12-31';
    const invoices = await db.collection('invoices').find({ bookingDate: { $gte: from, $lte: to } }).toArray();
    const expenses = await db.collection('expenses').find({ date: { $gte: from, $lte: to } }).toArray();
    const revenue = invoices.reduce((s,i) => s + (i.subtotal||0) - (i.discount||0), 0);
    const tax = invoices.reduce((s,i) => s + (i.tax||0), 0);
    const totalRevenue = invoices.reduce((s,i) => s + (i.totalAmount||0), 0);
    const expense = expenses.reduce((s,e) => s + (e.amount||0), 0);
    const net = revenue - expense;
    const expenseByCat = {};
    for (const e of expenses) expenseByCat[e.category] = (expenseByCat[e.category]||0) + (e.amount||0);
    return json({ revenue, tax, totalRevenue, expense, net, expenseByCat, invoices: invoices.length, expenseCount: expenses.length });
  }

  if (route === '/reports/gst' && method === 'GET') {
    const url = new URL(request.url);
    const from = url.searchParams.get('from') || '1970-01-01';
    const to = url.searchParams.get('to') || '2999-12-31';
    const invoices = await db.collection('invoices').find({ bookingDate: { $gte: from, $lte: to } }).toArray();
    const taxable = invoices.reduce((s,i) => s + Math.max(0, (i.subtotal||0) - (i.discount||0)), 0);
    const cgst = invoices.reduce((s,i) => s + (i.tax||0)/2, 0);
    const sgst = cgst;
    const igst = 0;
    const totalTax = cgst + sgst + igst;
    const total = invoices.reduce((s,i) => s + (i.totalAmount||0), 0);
    const paidTax = invoices.filter(i => (i.paidAmount||0) >= (i.totalAmount||0)).reduce((s,i) => s + (i.tax||0), 0);
    return json({ from, to, taxable, cgst, sgst, igst, totalTax, total, paidTax, pendingTax: totalTax - paidTax, count: invoices.length, invoices });
  }

  // --- STAFF ---
  if (route === '/staff' && method === 'GET') {
    const list = await db.collection('users').find({}, { projection: { password: 0 } }).toArray();
    return json(list);
  }
  if (route === '/staff' && method === 'POST') {
    const b = await request.json();
    const exist = await db.collection('users').findOne({ userId: b.userId });
    if (exist) return err('User ID already exists', 400);
    const doc = {
      id: uuid(),
      userId: b.userId,
      name: b.name,
      email: b.email || '',
      mobile: b.mobile || '',
      role: b.role || 'Staff',
      password: hash(b.password || '123'),
      mustChange: true,
      status: 'active',
      permissions: b.permissions || {},
      createdAt: new Date().toISOString(),
    };
    await db.collection('users').insertOne(doc);
    const { password, ...rest } = doc;
    return json(rest);
  }
  if (route.startsWith('/staff/') && method === 'PUT') {
    const id = route.split('/')[2];
    const b = await request.json();
    const upd = { ...b }; delete upd.id;
    if (b.password) upd.password = hash(b.password); else delete upd.password;
    await db.collection('users').updateOne({ id }, { $set: upd });
    return json({ ok: true });
  }
  if (route.startsWith('/staff/') && method === 'DELETE') {
    const id = route.split('/')[2];
    await db.collection('users').deleteOne({ id, userId: { $ne: 'admin' } });
    return json({ ok: true });
  }

  // --- SETTINGS ---
  if (route === '/settings' && method === 'GET') {
    const s = await db.collection('settings').findOne({ key: 'company' });
    return json(s);
  }
  if (route === '/settings' && method === 'PUT') {
    const b = await request.json();
    delete b._id;
    await db.collection('settings').updateOne({ key: 'company' }, { $set: b });
    return json({ ok: true });
  }

  // --- AUDIT LOGS ---
  if (route === '/audit-logs' && method === 'GET') {
    const list = await db.collection('audit_logs').find({}).sort({ at: -1 }).limit(200).toArray();
    return json(list);
  }
  if (route === '/login-logs' && method === 'GET') {
    const list = await db.collection('login_logs').find({}).sort({ at: -1 }).limit(100).toArray();
    return json(list);
  }

  return err(`Not found: ${method} ${route}`, 404);
}

function computeHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh*60+em) - (sh*60+sm);
  if (mins < 0) mins += 24*60;
  return +(mins / 60).toFixed(2);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
