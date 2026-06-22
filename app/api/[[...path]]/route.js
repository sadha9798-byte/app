import { NextResponse } from 'next/server';
import { v4 as uuid } from 'uuid';
import { getDb } from '@/lib/db';
import { ensureSeed, hash } from '@/lib/seed';
import { signToken, getAuth } from '@/lib/auth';

function json(data, init = {}) { return NextResponse.json(data, init); }
function err(msg, status = 400) { return NextResponse.json({ error: msg }, { status }); }

async function audit(userId, action, module, details = {}) {
  try {
    const db = await getDb();
    await db.collection('audit_logs').insertOne({
      id: uuid(), userId, action, module, details, at: new Date().toISOString(),
    });
  } catch (e) {}
}

async function nextInvoiceNumber() {
  const db = await getDb();
  const res = await db.collection('settings').findOneAndUpdate(
    { key: 'company' },
    { $inc: { invoiceCounter: 1 } },
    { returnDocument: 'after' }
  );
  const doc = res.value || res;
  const counter = doc?.invoiceCounter || (await db.collection('settings').findOne({ key: 'company' }))?.invoiceCounter || 1;
  const year = doc?.financialYear || new Date().getFullYear();
  const prefix = doc?.invoicePrefix || 'NXT';
  return `${prefix}-${year}-${String(counter).padStart(6, '0')}`;
}

function computeHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh*60+em) - (sh*60+sm);
  if (mins < 0) mins += 24*60;
  return +(mins / 60).toFixed(2);
}

// GST-INCLUSIVE pricing:
// Rate per hour is gross (inclusive of GST).
// gross = rate × hours
// afterDiscount = gross - discount (still inclusive)
// tax       = afterDiscount × gstRate / 100   (extracted)
// taxable   = afterDiscount - tax              (base value)
// total     = afterDiscount                    (what customer pays)
function computeTotals({ ratePerHour, totalHours, discount = 0, gstRate = 18, advanceAmount = 0 }) {
  const rate = Number(ratePerHour) || 0;
  const hours = Number(totalHours) || 0;
  const disc = Number(discount) || 0;
  const gst = Number(gstRate) || 0;
  const gross = +(rate * hours).toFixed(2);
  const afterDiscount = +Math.max(0, gross - disc).toFixed(2);
  const tax = +(afterDiscount * gst / 100).toFixed(2);
  const taxable = +(afterDiscount - tax).toFixed(2);
  const total = afterDiscount;
  const adv = Number(advanceAmount) || 0;
  const balance = +(total - adv).toFixed(2);
  return { gross, afterDiscount, tax, taxable, totalAmount: total, balance, paidAmount: adv };
}

async function handler(request, { params }) {
  await ensureSeed();
  const p = (await params)?.path || [];
  const route = '/' + p.join('/');
  const method = request.method;
  const db = await getDb();

  // PUBLIC
  if (route === '/' || route === '/health') {
    return json({ ok: true, app: 'NexTurf ERP', time: new Date().toISOString() });
  }
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

  const auth = getAuth(request);
  if (!auth) return err('Unauthorized', 401);

  // AUTH
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

  // DASHBOARD
  if (route === '/dashboard' && method === 'GET') {
    const today = new Date(); today.setHours(0,0,0,0);
    const todayStr = today.toISOString().slice(0,10);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);
    const settings = await db.collection('settings').findOne({ key: 'company' });
    const bookings = await db.collection('bookings').find({}).toArray();
    const invoices = await db.collection('invoices').find({}).toArray();
    const payments = await db.collection('payments').find({}).toArray();
    const customers = await db.collection('customers').find({}).sort({ createdAt: -1 }).limit(5).toArray();
    const todaysBookings = bookings.filter(b => b.bookingDate === todayStr);
    const todaysRevenue = invoices.filter(i => i.bookingDate === todayStr).reduce((s,i) => s + (i.totalAmount||0), 0);
    const monthsBookings = bookings.filter(b => b.bookingDate >= monthStart);
    const monthsRevenue = invoices.filter(i => i.bookingDate >= monthStart).reduce((s,i) => s + (i.totalAmount||0), 0);
    const outstanding = invoices.reduce((s,i) => s + ((i.totalAmount||0) - (i.paidAmount||0)), 0);
    // Capacity = number of turfs × operating hours per day (configurable)
    const numTurfs = Number(settings?.numTurfs) || 1;
    const openHour = Number(settings?.openHour ?? 6);
    const closeHour = Number(settings?.closeHour ?? 23);
    const hoursPerDay = Math.max(0, closeHour - openHour);
    const cap = numTurfs * hoursPerDay;
    const todayHours = todaysBookings.reduce((s,b) => s + (b.totalHours||0), 0);
    const occupancy = cap > 0 ? Math.min(100, Math.round((todayHours / cap) * 100)) : 0;
    const series = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0,10);
      const rev = invoices.filter(x => x.bookingDate === ds).reduce((s,x) => s + (x.totalAmount||0), 0);
      const bks = bookings.filter(x => x.bookingDate === ds).length;
      series.push({ date: ds.slice(5), revenue: rev, bookings: bks });
    }
    const sportSplit = {};
    for (const b of bookings) sportSplit[b.sport] = (sportSplit[b.sport] || 0) + 1;
    const sportData = Object.entries(sportSplit).map(([name, value]) => ({ name, value }));
    const paymentSplit = { Paid: 0, Partial: 0, Unpaid: 0 };
    for (const inv of invoices) {
      const paid = inv.paidAmount || 0;
      if (paid >= (inv.totalAmount||0)) paymentSplit.Paid++;
      else if (paid > 0) paymentSplit.Partial++;
      else paymentSplit.Unpaid++;
    }
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
        dailyCapacity: cap,
        numTurfs, openHour, closeHour,
      },
      series, sportData,
      paymentSplit: Object.entries(paymentSplit).map(([name,value]) => ({ name, value })),
      upcoming, recentTx, recentCustomers: customers,
    });
  }

  // SPORTS
  if (route === '/sports' && method === 'GET') {
    return json(await db.collection('sports').find({}).toArray());
  }

  // CUSTOMERS
  if (route === '/customers' && method === 'GET') {
    return json(await db.collection('customers').find({}).sort({ createdAt: -1 }).toArray());
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
    const b = await request.json(); delete b.id;
    await db.collection('customers').updateOne({ id }, { $set: b });
    return json({ ok: true });
  }
  if (route.startsWith('/customers/') && method === 'DELETE') {
    const id = route.split('/')[2];
    await db.collection('customers').deleteOne({ id });
    return json({ ok: true });
  }

  // BOOKINGS
  if (route === '/bookings' && method === 'GET') {
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const q = {};
    if (from && to) q.bookingDate = { $gte: from, $lte: to };
    return json(await db.collection('bookings').find(q).sort({ bookingDate: -1, startTime: -1 }).toArray());
  }
  if (route === '/bookings' && method === 'POST') {
    const b = await request.json();
    let customer = null;
    if (b.mobile) customer = await db.collection('customers').findOne({ mobile: b.mobile });
    if (!customer) {
      customer = { id: uuid(), name: b.customerName, mobile: b.mobile, email: b.email || '', address: '', gstNumber: b.gstNumber || '', lutNumber: b.lutNumber || '', createdAt: new Date().toISOString() };
      await db.collection('customers').insertOne(customer);
    } else if (b.gstNumber || b.lutNumber) {
      // update GST/LUT if newly provided
      const upd = {};
      if (b.gstNumber && !customer.gstNumber) upd.gstNumber = b.gstNumber;
      if (b.lutNumber && !customer.lutNumber) upd.lutNumber = b.lutNumber;
      if (Object.keys(upd).length) {
        await db.collection('customers').updateOne({ id: customer.id }, { $set: upd });
        customer = { ...customer, ...upd };
      }
    }
    const totalHours = computeHours(b.startTime, b.endTime);
    const t = computeTotals({ ratePerHour: b.ratePerHour, totalHours, discount: b.discount, gstRate: b.gstRate ?? 18, advanceAmount: b.advanceAmount });

    const sportName = b.sport === 'Others' && b.sportCustom ? b.sportCustom : b.sport;
    const bookingId = `BK-${Date.now().toString().slice(-8)}`;
    const doc = {
      id: uuid(), bookingId,
      customerId: customer.id, customerName: customer.name, mobile: customer.mobile, email: customer.email,
      gstNumber: b.gstNumber || customer.gstNumber || '',
      lutNumber: b.lutNumber || customer.lutNumber || '',
      sport: sportName, sportCategory: b.sport, // Football/Others/etc
      bookingDate: b.bookingDate, startTime: b.startTime, endTime: b.endTime,
      totalHours, ratePerHour: Number(b.ratePerHour) || 0, discount: Number(b.discount) || 0, gstRate: Number(b.gstRate ?? 18),
      gross: t.gross, taxableValue: t.taxable, tax: t.tax,
      subtotal: t.taxable,
      totalAmount: t.totalAmount, advanceAmount: t.paidAmount, balanceAmount: t.balance,
      paymentStatus: t.paidAmount >= t.totalAmount ? 'Paid' : t.paidAmount > 0 ? 'Partial' : 'Unpaid',
      status: b.status || 'Confirmed',
      notes: b.notes || '', source: b.source || 'Manual',
      createdBy: auth.userId, createdAt: new Date().toISOString(),
    };
    await db.collection('bookings').insertOne(doc);

    const invoiceNumber = await nextInvoiceNumber();
    const inv = {
      id: uuid(), invoiceNumber,
      bookingId: doc.id, bookingRef: doc.bookingId,
      customerId: customer.id, customerName: customer.name, mobile: customer.mobile, email: customer.email,
      gstNumber: b.gstNumber || customer.gstNumber || '',
      lutNumber: b.lutNumber || customer.lutNumber || '',
      sport: sportName, sportCategory: b.sport,
      bookingDate: doc.bookingDate, startTime: doc.startTime, endTime: doc.endTime,
      totalHours, ratePerHour: doc.ratePerHour,
      gross: t.gross, taxableValue: t.taxable, subtotal: t.taxable,
      discount: doc.discount, gstRate: doc.gstRate, tax: t.tax,
      totalAmount: t.totalAmount, paidAmount: t.paidAmount, balance: t.balance,
      gstInclusive: true,
      isGst: !!(b.gstNumber || customer.gstNumber),
      status: 'Issued', createdAt: new Date().toISOString(), createdBy: auth.userId,
    };
    await db.collection('invoices').insertOne(inv);
    if (t.paidAmount > 0) {
      await db.collection('payments').insertOne({
        id: uuid(), invoiceId: inv.id, invoiceNumber: inv.invoiceNumber,
        bookingId: doc.id, customerId: customer.id, customerName: customer.name,
        amount: t.paidAmount, mode: b.paymentMode || 'Cash',
        at: new Date().toISOString(), notes: 'Advance at booking', createdBy: auth.userId,
      });
    }
    await audit(auth.userId, 'CREATE', 'bookings', { id: doc.id, invoice: invoiceNumber });
    return json({ booking: doc, invoice: inv });
  }
  if (route.startsWith('/bookings/') && method === 'PUT') {
    const id = route.split('/')[2];
    const b = await request.json();
    const existing = await db.collection('bookings').findOne({ id });
    if (!existing) return err('Not found', 404);
    const totalHours = (b.startTime && b.endTime) ? computeHours(b.startTime, b.endTime) : existing.totalHours;
    const ratePerHour = b.ratePerHour ?? existing.ratePerHour;
    const discount = b.discount ?? existing.discount;
    const gstRate = b.gstRate ?? existing.gstRate;
    const t = computeTotals({ ratePerHour, totalHours, discount, gstRate, advanceAmount: existing.advanceAmount || 0 });
    const update = {
      ...b,
      totalHours, ratePerHour: Number(ratePerHour), discount: Number(discount), gstRate: Number(gstRate),
      gross: t.gross, taxableValue: t.taxable, subtotal: t.taxable, tax: t.tax,
      totalAmount: t.totalAmount, balanceAmount: t.balance,
    };
    delete update.id;
    await db.collection('bookings').updateOne({ id }, { $set: update });
    // sync invoice
    await db.collection('invoices').updateOne({ bookingId: id }, { $set: {
      sport: update.sport ?? existing.sport,
      bookingDate: update.bookingDate ?? existing.bookingDate,
      startTime: update.startTime ?? existing.startTime,
      endTime: update.endTime ?? existing.endTime,
      totalHours, ratePerHour: Number(ratePerHour), discount: Number(discount), gstRate: Number(gstRate),
      gross: t.gross, taxableValue: t.taxable, subtotal: t.taxable, tax: t.tax,
      totalAmount: t.totalAmount, balance: t.totalAmount - (existing.advanceAmount||0),
    }});
    return json({ ok: true });
  }
  if (route.startsWith('/bookings/') && method === 'DELETE') {
    const id = route.split('/')[2];
    await db.collection('bookings').deleteOne({ id });
    // also delete linked invoices + payments
    const inv = await db.collection('invoices').findOne({ bookingId: id });
    if (inv) {
      await db.collection('payments').deleteMany({ invoiceId: inv.id });
      await db.collection('invoices').deleteOne({ id: inv.id });
    }
    return json({ ok: true });
  }

  // INVOICES — full CRUD for admin
  if (route === '/invoices' && method === 'GET') {
    return json(await db.collection('invoices').find({}).sort({ createdAt: -1 }).toArray());
  }
  if (route === '/invoices' && method === 'POST') {
    // Manual invoice creation (also creates a stub booking so dashboards stay consistent)
    const b = await request.json();
    let customer = null;
    if (b.mobile) customer = await db.collection('customers').findOne({ mobile: b.mobile });
    if (!customer) {
      customer = { id: uuid(), name: b.customerName, mobile: b.mobile, email: b.email || '', address: '', gstNumber: b.gstNumber || '', lutNumber: b.lutNumber || '', createdAt: new Date().toISOString() };
      await db.collection('customers').insertOne(customer);
    }
    const totalHours = computeHours(b.startTime, b.endTime);
    const t = computeTotals({ ratePerHour: b.ratePerHour, totalHours, discount: b.discount, gstRate: b.gstRate ?? 18, advanceAmount: b.paidAmount });
    const sportName = b.sport === 'Others' && b.sportCustom ? b.sportCustom : b.sport;
    const bookingId = `BK-${Date.now().toString().slice(-8)}`;
    const booking = {
      id: uuid(), bookingId,
      customerId: customer.id, customerName: customer.name, mobile: customer.mobile, email: customer.email,
      gstNumber: b.gstNumber || customer.gstNumber || '',
      lutNumber: b.lutNumber || customer.lutNumber || '',
      sport: sportName, sportCategory: b.sport,
      bookingDate: b.bookingDate, startTime: b.startTime, endTime: b.endTime,
      totalHours, ratePerHour: Number(b.ratePerHour) || 0, discount: Number(b.discount) || 0, gstRate: Number(b.gstRate ?? 18),
      gross: t.gross, taxableValue: t.taxable, subtotal: t.taxable, tax: t.tax,
      totalAmount: t.totalAmount, advanceAmount: t.paidAmount, balanceAmount: t.balance,
      paymentStatus: t.paidAmount >= t.totalAmount ? 'Paid' : t.paidAmount > 0 ? 'Partial' : 'Unpaid',
      status: b.status || 'Confirmed', notes: b.notes || '',
      source: 'Manual Invoice', createdBy: auth.userId, createdAt: new Date().toISOString(),
    };
    await db.collection('bookings').insertOne(booking);
    const invoiceNumber = await nextInvoiceNumber();
    const inv = {
      id: uuid(), invoiceNumber,
      bookingId: booking.id, bookingRef: booking.bookingId,
      customerId: customer.id, customerName: customer.name, mobile: customer.mobile, email: customer.email,
      gstNumber: b.gstNumber || customer.gstNumber || '',
      lutNumber: b.lutNumber || customer.lutNumber || '',
      sport: sportName, sportCategory: b.sport,
      bookingDate: booking.bookingDate, startTime: booking.startTime, endTime: booking.endTime,
      totalHours, ratePerHour: booking.ratePerHour,
      gross: t.gross, taxableValue: t.taxable, subtotal: t.taxable,
      discount: booking.discount, gstRate: booking.gstRate, tax: t.tax,
      totalAmount: t.totalAmount, paidAmount: t.paidAmount, balance: t.balance,
      gstInclusive: true, isGst: !!(b.gstNumber || customer.gstNumber),
      status: 'Issued', createdAt: new Date().toISOString(), createdBy: auth.userId,
    };
    await db.collection('invoices').insertOne(inv);
    if (t.paidAmount > 0) {
      await db.collection('payments').insertOne({
        id: uuid(), invoiceId: inv.id, invoiceNumber: inv.invoiceNumber,
        bookingId: booking.id, customerId: customer.id, customerName: customer.name,
        amount: t.paidAmount, mode: b.paymentMode || 'Cash',
        at: new Date().toISOString(), notes: 'Initial payment', createdBy: auth.userId,
      });
    }
    await audit(auth.userId, 'CREATE', 'invoices', { id: inv.id });
    return json({ booking, invoice: inv });
  }
  if (route.startsWith('/invoices/') && method === 'GET') {
    const id = route.split('/')[2];
    const inv = await db.collection('invoices').findOne({ id });
    if (!inv) return err('Not found', 404);
    const company = await db.collection('settings').findOne({ key: 'company' });
    const payments = await db.collection('payments').find({ invoiceId: id }).toArray();
    return json({ invoice: inv, company, payments });
  }
  if (route.startsWith('/invoices/') && method === 'PUT') {
    const id = route.split('/')[2];
    const b = await request.json();
    const inv = await db.collection('invoices').findOne({ id });
    if (!inv) return err('Not found', 404);
    const startTime = b.startTime ?? inv.startTime;
    const endTime = b.endTime ?? inv.endTime;
    const totalHours = computeHours(startTime, endTime);
    const ratePerHour = b.ratePerHour ?? inv.ratePerHour;
    const discount = b.discount ?? inv.discount;
    const gstRate = b.gstRate ?? inv.gstRate;
    const t = computeTotals({ ratePerHour, totalHours, discount, gstRate, advanceAmount: inv.paidAmount || 0 });
    const update = {
      customerName: b.customerName ?? inv.customerName,
      mobile: b.mobile ?? inv.mobile,
      email: b.email ?? inv.email,
      gstNumber: b.gstNumber ?? inv.gstNumber,
      lutNumber: b.lutNumber ?? inv.lutNumber,
      sport: (b.sport === 'Others' && b.sportCustom) ? b.sportCustom : (b.sport ?? inv.sport),
      sportCategory: b.sport ?? inv.sportCategory,
      bookingDate: b.bookingDate ?? inv.bookingDate,
      startTime, endTime,
      totalHours, ratePerHour: Number(ratePerHour), discount: Number(discount), gstRate: Number(gstRate),
      gross: t.gross, taxableValue: t.taxable, subtotal: t.taxable, tax: t.tax,
      totalAmount: t.totalAmount, balance: t.balance,
      gstInclusive: true,
      isGst: !!(b.gstNumber ?? inv.gstNumber),
    };
    await db.collection('invoices').updateOne({ id }, { $set: update });
    // sync linked booking too
    if (inv.bookingId) {
      await db.collection('bookings').updateOne({ id: inv.bookingId }, { $set: {
        customerName: update.customerName, mobile: update.mobile, email: update.email,
        sport: update.sport, bookingDate: update.bookingDate,
        startTime, endTime, totalHours,
        ratePerHour: Number(ratePerHour), discount: Number(discount), gstRate: Number(gstRate),
        gross: t.gross, taxableValue: t.taxable, subtotal: t.taxable, tax: t.tax,
        totalAmount: t.totalAmount, balanceAmount: t.balance,
      }});
    }
    await audit(auth.userId, 'UPDATE', 'invoices', { id });
    return json({ ok: true });
  }
  if (route.startsWith('/invoices/') && method === 'DELETE') {
    const id = route.split('/')[2];
    const inv = await db.collection('invoices').findOne({ id });
    if (!inv) return err('Not found', 404);
    await db.collection('payments').deleteMany({ invoiceId: id });
    if (inv.bookingId) await db.collection('bookings').deleteOne({ id: inv.bookingId });
    await db.collection('invoices').deleteOne({ id });
    await audit(auth.userId, 'DELETE', 'invoices', { id });
    return json({ ok: true });
  }

  // PAYMENTS — list / create / update / delete
  if (route === '/payments' && method === 'GET') {
    return json(await db.collection('payments').find({}).sort({ at: -1 }).toArray());
  }
  if (route === '/payments' && method === 'POST') {
    const b = await request.json();
    const inv = await db.collection('invoices').findOne({ id: b.invoiceId });
    if (!inv) return err('Invoice not found', 404);
    const amount = Number(b.amount) || 0;
    const pay = {
      id: uuid(), invoiceId: inv.id, invoiceNumber: inv.invoiceNumber,
      bookingId: inv.bookingId, customerId: inv.customerId, customerName: inv.customerName,
      amount, mode: b.mode || 'Cash', at: b.at || new Date().toISOString(),
      notes: b.notes || '', createdBy: auth.userId,
    };
    await db.collection('payments').insertOne(pay);
    await recomputeInvoicePayments(db, inv.id);
    await audit(auth.userId, 'CREATE', 'payments', { id: pay.id });
    return json(pay);
  }
  if (route.startsWith('/payments/') && method === 'PUT') {
    const id = route.split('/')[2];
    const b = await request.json();
    const existing = await db.collection('payments').findOne({ id });
    if (!existing) return err('Not found', 404);
    const upd = { ...b }; delete upd.id; delete upd.invoiceId;
    if (upd.amount !== undefined) upd.amount = Number(upd.amount) || 0;
    await db.collection('payments').updateOne({ id }, { $set: upd });
    await recomputeInvoicePayments(db, existing.invoiceId);
    await audit(auth.userId, 'UPDATE', 'payments', { id });
    return json({ ok: true });
  }
  if (route.startsWith('/payments/') && method === 'DELETE') {
    const id = route.split('/')[2];
    const existing = await db.collection('payments').findOne({ id });
    if (!existing) return err('Not found', 404);
    await db.collection('payments').deleteOne({ id });
    await recomputeInvoicePayments(db, existing.invoiceId);
    await audit(auth.userId, 'DELETE', 'payments', { id });
    return json({ ok: true });
  }

  // EXPENSES
  if (route === '/expenses' && method === 'GET') {
    return json(await db.collection('expenses').find({}).sort({ date: -1 }).toArray());
  }
  if (route === '/expenses' && method === 'POST') {
    const b = await request.json();
    const doc = {
      id: uuid(), date: b.date, category: b.category, vendor: b.vendor || '',
      description: b.description || '', amount: Number(b.amount) || 0,
      approvedBy: b.approvedBy || auth.userId, createdBy: auth.userId,
      createdAt: new Date().toISOString(),
    };
    await db.collection('expenses').insertOne(doc);
    return json(doc);
  }
  if (route.startsWith('/expenses/') && method === 'DELETE') {
    await db.collection('expenses').deleteOne({ id: route.split('/')[2] });
    return json({ ok: true });
  }

  // REPORTS
  if (route === '/reports/pnl' && method === 'GET') {
    const url = new URL(request.url);
    const from = url.searchParams.get('from') || '1970-01-01';
    const to = url.searchParams.get('to') || '2999-12-31';
    const invoices = await db.collection('invoices').find({ bookingDate: { $gte: from, $lte: to } }).toArray();
    const expenses = await db.collection('expenses').find({ date: { $gte: from, $lte: to } }).toArray();
    const revenue = invoices.reduce((s,i) => s + (i.taxableValue ?? Math.max(0,(i.subtotal||0)-(i.discount||0))), 0);
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
    const taxable = invoices.reduce((s,i) => s + (i.taxableValue ?? Math.max(0,(i.subtotal||0)-(i.discount||0))), 0);
    const cgst = invoices.reduce((s,i) => s + (i.tax||0)/2, 0);
    const sgst = cgst;
    const igst = 0;
    const totalTax = cgst + sgst + igst;
    const total = invoices.reduce((s,i) => s + (i.totalAmount||0), 0);
    const paidTax = invoices.filter(i => (i.paidAmount||0) >= (i.totalAmount||0)).reduce((s,i) => s + (i.tax||0), 0);
    return json({ from, to, taxable, cgst, sgst, igst, totalTax, total, paidTax, pendingTax: totalTax - paidTax, count: invoices.length, invoices });
  }

  // STAFF (Super Admin only for create/update/delete; Super Admin only for listing too)
  if (route === '/staff' && method === 'GET') {
    if (auth.role !== 'Super Admin') return err('Only Super Admin can view staff', 403);
    return json(await db.collection('users').find({}, { projection: { password: 0 } }).toArray());
  }
  if (route === '/staff' && method === 'POST') {
    if (auth.role !== 'Super Admin') return err('Only Super Admin can add staff', 403);
    const b = await request.json();
    if (await db.collection('users').findOne({ userId: b.userId })) return err('User ID already exists', 400);
    const doc = {
      id: uuid(), userId: b.userId, name: b.name, email: b.email || '', mobile: b.mobile || '',
      role: b.role || 'Staff', password: hash(b.password || '123'), mustChange: true, status: 'active',
      permissions: b.permissions || {}, createdAt: new Date().toISOString(),
    };
    await db.collection('users').insertOne(doc);
    await audit(auth.userId, 'CREATE', 'staff', { id: doc.id, userId: doc.userId });
    const { password, ...rest } = doc;
    return json(rest);
  }
  if (route.startsWith('/staff/') && method === 'PUT') {
    if (auth.role !== 'Super Admin') return err('Only Super Admin can edit staff', 403);
    const id = route.split('/')[2];
    const b = await request.json();
    const upd = { ...b }; delete upd.id;
    if (b.password) upd.password = hash(b.password); else delete upd.password;
    await db.collection('users').updateOne({ id }, { $set: upd });
    await audit(auth.userId, 'UPDATE', 'staff', { id });
    return json({ ok: true });
  }
  if (route.startsWith('/staff/') && method === 'DELETE') {
    if (auth.role !== 'Super Admin') return err('Only Super Admin can remove staff', 403);
    const id = route.split('/')[2];
    const target = await db.collection('users').findOne({ id });
    if (target?.userId === 'admin') return err('Cannot delete the default Super Admin', 400);
    await db.collection('users').deleteOne({ id, userId: { $ne: 'admin' } });
    await audit(auth.userId, 'DELETE', 'staff', { id });
    return json({ ok: true });
  }

  // SETTINGS
  if (route === '/settings' && method === 'GET') {
    return json(await db.collection('settings').findOne({ key: 'company' }));
  }
  if (route === '/settings' && method === 'PUT') {
    const b = await request.json(); delete b._id;
    await db.collection('settings').updateOne({ key: 'company' }, { $set: b });
    return json({ ok: true });
  }

  if (route === '/audit-logs' && method === 'GET') {
    return json(await db.collection('audit_logs').find({}).sort({ at: -1 }).limit(200).toArray());
  }
  if (route === '/login-logs' && method === 'GET') {
    return json(await db.collection('login_logs').find({}).sort({ at: -1 }).limit(100).toArray());
  }

  return err(`Not found: ${method} ${route}`, 404);
}

async function recomputeInvoicePayments(db, invoiceId) {
  const inv = await db.collection('invoices').findOne({ id: invoiceId });
  if (!inv) return;
  const pays = await db.collection('payments').find({ invoiceId }).toArray();
  const paid = pays.reduce((s,p) => s + (p.amount||0), 0);
  const bal = (inv.totalAmount || 0) - paid;
  await db.collection('invoices').updateOne({ id: invoiceId }, { $set: { paidAmount: paid, balance: bal } });
  const status = paid >= (inv.totalAmount||0) ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid';
  if (inv.bookingId) {
    await db.collection('bookings').updateOne({ id: inv.bookingId }, { $set: { advanceAmount: paid, balanceAmount: bal, paymentStatus: status } });
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
