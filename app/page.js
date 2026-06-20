'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  LayoutDashboard, CalendarDays, Users, FileText, IndianRupee, Receipt, BarChart3,
  Settings as SettingsIcon, LogOut, Menu, Search, Activity, Shield, Plus, Trash2,
  Download, Printer, ChevronLeft, ChevronRight, Building2, TrendingUp, Wallet,
  Clock, CircleDollarSign, ListChecks, FileBarChart, KeyRound,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area,
} from 'recharts';

const COLORS = ['#22c55e','#f59e0b','#3b82f6','#8b5cf6','#ef4444','#06b6d4'];
const SPORT_COLOR = { Football: '#22c55e', Cricket: '#f59e0b', Volleyball: '#3b82f6', Coaching: '#8b5cf6' };
const STATUS_COLOR = {
  Confirmed: 'bg-red-500/15 text-red-600 border-red-500/30',
  Pending: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  Completed: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  Cancelled: 'bg-zinc-500/15 text-zinc-500 border-zinc-500/30',
  Rescheduled: 'bg-sky-500/15 text-sky-600 border-sky-500/30',
};

function fmtINR(n) {
  return '\u20B9 ' + Number(n||0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
function todayStr() { return new Date().toISOString().slice(0,10); }

// ----------------- API CLIENT -----------------
function api(path, opts = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('nxt_token') : null;
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`/api${path}`, { ...opts, headers }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    return data;
  });
}

// ----------------- LOGIN PAGE -----------------
function LoginPage({ onLogin }) {
  const [userId, setUserId] = useState('admin');
  const [password, setPassword] = useState('123');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api('/auth/login', { method: 'POST', body: JSON.stringify({ userId, password }) });
      localStorage.setItem('nxt_token', res.token);
      localStorage.setItem('nxt_user', JSON.stringify(res.user));
      toast.success(`Welcome ${res.user.name}`);
      onLogin(res.user);
    } catch (e) {
      toast.error(e.message);
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-100 p-4">
      <div className="grid lg:grid-cols-2 gap-8 max-w-5xl w-full items-center">
        <div className="hidden lg:block">
          <div className="flex items-center gap-3 mb-6">
            <div className="size-12 rounded-xl bg-emerald-600 text-white grid place-items-center font-bold text-2xl shadow-lg shadow-emerald-200">N</div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">NexTurf <span className="text-emerald-600">ERP</span></h1>
              <p className="text-sm text-muted-foreground">by Athletixcel Sports Pvt Ltd</p>
            </div>
          </div>
          <h2 className="text-4xl font-bold leading-tight mb-4">Run your turf like a Fortune-500 sports facility.</h2>
          <p className="text-muted-foreground mb-6">Bookings, billing, GST, accounting, coaching, tournaments, PlayO sync — all in one beautiful dashboard.</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {['Calendar bookings','Auto GST invoices','Profit & Loss','PlayO + District sync','WhatsApp/Email','Role-based access'].map(x => (
              <div key={x} className="flex items-center gap-2 p-3 rounded-lg bg-white/70 border">
                <div className="size-2 rounded-full bg-emerald-500" />{x}
              </div>
            ))}
          </div>
        </div>
        <Card className="shadow-2xl border-emerald-100">
          <CardHeader>
            <div className="lg:hidden flex items-center gap-2 mb-2">
              <div className="size-10 rounded-lg bg-emerald-600 text-white grid place-items-center font-bold">N</div>
              <span className="font-bold text-xl">NexTurf ERP</span>
            </div>
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <CardDescription>Use <code className="text-emerald-600 font-medium">admin</code> / <code className="text-emerald-600 font-medium">123</code> for the first login.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label>User ID</Label>
                <Input value={userId} onChange={e => setUserId(e.target.value)} placeholder="admin" required />
              </div>
              <div>
                <Label>Password</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••" required />
              </div>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in to NexTurf'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ----------------- KPI CARD -----------------
function Kpi({ label, value, icon: Icon, accent='emerald', hint }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className={`size-10 rounded-lg grid place-items-center bg-${accent}-100 text-${accent}-700`}>
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ----------------- DASHBOARD -----------------
function Dashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api('/dashboard').then(setData).catch(e => toast.error(e.message)); }, []);
  if (!data) return <div className="p-8 text-muted-foreground">Loading dashboard...</div>;
  const k = data.kpis;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Real-time overview of your turf operations.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Today's Revenue" value={fmtINR(k.todaysRevenue)} icon={IndianRupee} accent="emerald" />
        <Kpi label="Today's Bookings" value={k.todaysBookings} icon={CalendarDays} accent="blue" />
        <Kpi label="Monthly Revenue" value={fmtINR(k.monthsRevenue)} icon={TrendingUp} accent="violet" />
        <Kpi label="Monthly Bookings" value={k.monthsBookings} icon={ListChecks} accent="amber" />
        <Kpi label="Outstanding" value={fmtINR(k.outstanding)} icon={Wallet} accent="rose" />
        <Kpi label="Occupancy" value={`${k.occupancy}%`} icon={Activity} accent="emerald" hint="Of 48 hrs/day capacity" />
        <Kpi label="Available Slots" value={`${k.availableSlots} hrs`} icon={Clock} accent="sky" />
        <Kpi label="Confirmed Today" value={k.todaysBookings} icon={CircleDollarSign} accent="teal" />
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Revenue (last 14 days)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <AreaChart data={data.series}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v) => fmtINR(v)} />
                <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="url(#rev)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Payment Status</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data.paymentSplit} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} label>
                  {data.paymentSplit.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip /><Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle>Bookings by Sport</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer>
              <BarChart data={data.sportData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="value" radius={[8,8,0,0]}>
                  {data.sportData.map((d, i) => <Cell key={i} fill={SPORT_COLOR[d.name] || COLORS[i%COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Upcoming Bookings</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Time</TableHead><TableHead>Customer</TableHead><TableHead>Sport</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.upcoming.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No upcoming bookings</TableCell></TableRow>}
                {data.upcoming.map(b => (
                  <TableRow key={b.id}>
                    <TableCell>{b.bookingDate}</TableCell>
                    <TableCell>{b.startTime}–{b.endTime}</TableCell>
                    <TableCell>{b.customerName}</TableCell>
                    <TableCell><Badge variant="outline" style={{borderColor: SPORT_COLOR[b.sport], color: SPORT_COLOR[b.sport]}}>{b.sport}</Badge></TableCell>
                    <TableCell><Badge className={STATUS_COLOR[b.status] + ' border'}>{b.status}</Badge></TableCell>
                    <TableCell className="text-right font-medium">{fmtINR(b.totalAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ----------------- BOOKINGS -----------------
function BookingForm({ onCreated, sports, initial }) {
  const [form, setForm] = useState({
    customerName: '', mobile: '', email: '',
    sport: sports[0]?.name || 'Football',
    bookingDate: todayStr(),
    startTime: '17:00', endTime: '18:00',
    ratePerHour: sports[0]?.ratePerHour || 1200,
    discount: 0, gstRate: 18,
    advanceAmount: 0, paymentMode: 'Cash',
    notes: '', status: 'Confirmed',
    ...(initial || {}),
  });
  const [busy, setBusy] = useState(false);
  const hours = useMemo(() => {
    if (!form.startTime || !form.endTime) return 0;
    const [sh, sm] = form.startTime.split(':').map(Number);
    const [eh, em] = form.endTime.split(':').map(Number);
    let mins = (eh*60+em) - (sh*60+sm); if (mins<0) mins += 24*60;
    return +(mins/60).toFixed(2);
  }, [form.startTime, form.endTime]);
  const subtotal = hours * Number(form.ratePerHour||0);
  const taxable = Math.max(0, subtotal - Number(form.discount||0));
  const tax = +(taxable * Number(form.gstRate||0) / 100).toFixed(2);
  const total = +(taxable + tax).toFixed(2);
  const balance = +(total - Number(form.advanceAmount||0)).toFixed(2);

  function setSport(name) {
    const s = sports.find(x => x.name === name);
    setForm(f => ({ ...f, sport: name, ratePerHour: s?.ratePerHour || f.ratePerHour }));
  }

  async function submit() {
    if (!form.customerName || !form.mobile) return toast.error('Customer name & mobile required');
    setBusy(true);
    try {
      const r = await api('/bookings', { method: 'POST', body: JSON.stringify(form) });
      toast.success(`Booking ${r.booking.bookingId} created · Invoice ${r.invoice.invoiceNumber}`);
      onCreated?.(r);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="space-y-3">
        <div><Label>Customer Name</Label><Input value={form.customerName} onChange={e => setForm({...form, customerName:e.target.value})} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Mobile</Label><Input value={form.mobile} onChange={e => setForm({...form, mobile:e.target.value})} /></div>
          <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({...form, email:e.target.value})} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Sport</Label>
            <Select value={form.sport} onValueChange={setSport}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{sports.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Date</Label><Input type="date" value={form.bookingDate} onChange={e => setForm({...form, bookingDate:e.target.value})} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Start</Label><Input type="time" value={form.startTime} onChange={e => setForm({...form, startTime:e.target.value})} /></div>
          <div><Label>End</Label><Input type="time" value={form.endTime} onChange={e => setForm({...form, endTime:e.target.value})} /></div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div><Label>Rate/hr</Label><Input type="number" value={form.ratePerHour} onChange={e => setForm({...form, ratePerHour:e.target.value})} /></div>
          <div><Label>Discount</Label><Input type="number" value={form.discount} onChange={e => setForm({...form, discount:e.target.value})} /></div>
          <div><Label>GST %</Label><Input type="number" value={form.gstRate} onChange={e => setForm({...form, gstRate:e.target.value})} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm({...form, status:v})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{['Pending','Confirmed','Completed','Cancelled','Rescheduled'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Payment Mode</Label>
            <Select value={form.paymentMode} onValueChange={v => setForm({...form, paymentMode:v})}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{['Cash','UPI','Google Pay','PhonePe','Paytm','Card','Bank Transfer','Cheque'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div><Label>Advance Paid</Label><Input type="number" value={form.advanceAmount} onChange={e => setForm({...form, advanceAmount:e.target.value})} /></div>
        <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} /></div>
      </div>
      <div className="space-y-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Booking Summary</div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>Hours</span><span className="font-medium">{hours} hr</span></div>
              <div className="flex justify-between"><span>Subtotal</span><span>{fmtINR(subtotal)}</span></div>
              <div className="flex justify-between"><span>Discount</span><span>-{fmtINR(form.discount)}</span></div>
              <div className="flex justify-between"><span>GST ({form.gstRate}%)</span><span>{fmtINR(tax)}</span></div>
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-bold"><span>Total</span><span>{fmtINR(total)}</span></div>
              <div className="flex justify-between text-emerald-700"><span>Advance</span><span>{fmtINR(form.advanceAmount)}</span></div>
              <div className="flex justify-between text-rose-700 font-medium"><span>Balance</span><span>{fmtINR(balance)}</span></div>
            </div>
            <Button onClick={submit} disabled={busy} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700">
              {busy ? 'Creating...' : 'Create Booking + Auto-Invoice'}
            </Button>
            <p className="text-[11px] text-muted-foreground mt-2">An invoice (e.g. NXT-2026-000001) will be auto-generated.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CalendarView({ bookings, onDayClick }) {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const start = new Date(month);
  const firstDay = start.getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth()+1, 0).getDate();
  const cells = [];
  for (let i=0; i<firstDay; i++) cells.push(null);
  for (let d=1; d<=daysInMonth; d++) cells.push(d);
  const monthLabel = month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{monthLabel}</CardTitle>
        <div className="flex gap-2">
          <Button size="icon" variant="outline" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()-1, 1))}><ChevronLeft className="size-4"/></Button>
          <Button size="sm" variant="outline" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</Button>
          <Button size="icon" variant="outline" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth()+1, 1))}><ChevronRight className="size-4"/></Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 text-xs font-medium text-muted-foreground mb-1">
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="px-2 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="h-24 rounded bg-muted/30" />;
            const ds = new Date(month.getFullYear(), month.getMonth(), d).toISOString().slice(0,10);
            const bks = bookings.filter(b => b.bookingDate === ds);
            const isToday = ds === todayStr();
            return (
              <button key={i} onClick={() => onDayClick(ds)} className={`h-24 rounded border p-1.5 text-left hover:bg-emerald-50 transition ${isToday ? 'border-emerald-500 bg-emerald-50/40' : 'border-border'}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs ${isToday?'font-bold text-emerald-700':'text-foreground'}`}>{d}</span>
                  {bks.length > 0 && <span className="text-[10px] bg-emerald-600 text-white px-1.5 rounded-full">{bks.length}</span>}
                </div>
                <div className="mt-1 space-y-0.5">
                  {bks.slice(0,2).map(b => (
                    <div key={b.id} className="text-[10px] truncate px-1 py-0.5 rounded text-white" style={{background: SPORT_COLOR[b.sport] || '#64748b'}}>
                      {b.startTime} {b.customerName}
                    </div>
                  ))}
                  {bks.length > 2 && <div className="text-[10px] text-muted-foreground">+{bks.length-2} more</div>}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function Bookings() {
  const [list, setList] = useState([]);
  const [sports, setSports] = useState([]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('calendar');
  const [filterDate, setFilterDate] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    api('/bookings').then(setList).catch(e => toast.error(e.message));
  }, []);
  useEffect(() => { load(); api('/sports').then(setSports); }, [load]);

  const filtered = list.filter(b => {
    if (filterDate && b.bookingDate !== filterDate) return false;
    if (query) {
      const q = query.toLowerCase();
      return (b.customerName||'').toLowerCase().includes(q) || (b.mobile||'').includes(q) || (b.bookingId||'').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bookings</h1>
          <p className="text-sm text-muted-foreground">Manage all turf bookings with calendar & list views.</p>
        </div>
        <div className="flex gap-2">
          <Tabs value={view} onValueChange={setView}>
            <TabsList>
              <TabsTrigger value="calendar"><CalendarDays className="size-4 mr-1"/>Calendar</TabsTrigger>
              <TabsTrigger value="list"><ListChecks className="size-4 mr-1"/>List</TabsTrigger>
            </TabsList>
          </Tabs>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-emerald-600 hover:bg-emerald-700"><Plus className="size-4 mr-1"/>New Booking</Button></DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Booking</DialogTitle></DialogHeader>
              <BookingForm sports={sports} onCreated={() => { setOpen(false); load(); }} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap text-xs">
        {Object.entries(SPORT_COLOR).map(([k,v]) => (
          <span key={k} className="flex items-center gap-1.5"><span className="size-3 rounded" style={{background:v}}/>{k}</span>
        ))}
      </div>

      {view === 'calendar' ? (
        <CalendarView bookings={list} onDayClick={(ds) => { setFilterDate(ds); setView('list'); }} />
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="size-4 absolute left-3 top-3 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search name, mobile, booking id..." value={query} onChange={e => setQuery(e.target.value)} />
            </div>
            <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="w-44" />
            {filterDate && <Button variant="outline" size="sm" onClick={() => setFilterDate('')}>Clear date</Button>}
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Booking ID</TableHead><TableHead>Date</TableHead><TableHead>Time</TableHead>
                <TableHead>Customer</TableHead><TableHead>Sport</TableHead><TableHead>Status</TableHead>
                <TableHead>Payment</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Balance</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">No bookings found</TableCell></TableRow>}
                {filtered.map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.bookingId}</TableCell>
                    <TableCell>{b.bookingDate}</TableCell>
                    <TableCell>{b.startTime}–{b.endTime}</TableCell>
                    <TableCell>
                      <div className="font-medium">{b.customerName}</div>
                      <div className="text-xs text-muted-foreground">{b.mobile}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline" style={{borderColor: SPORT_COLOR[b.sport], color: SPORT_COLOR[b.sport]}}>{b.sport}</Badge></TableCell>
                    <TableCell><Badge className={(STATUS_COLOR[b.status]||'') + ' border'}>{b.status}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={b.paymentStatus === 'Paid' ? 'default' : b.paymentStatus === 'Partial' ? 'secondary' : 'destructive'}>{b.paymentStatus}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{fmtINR(b.totalAmount)}</TableCell>
                    <TableCell className="text-right text-rose-600 font-medium">{fmtINR(b.balanceAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ----------------- CUSTOMERS -----------------
function Customers() {
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name:'', mobile:'', email:'', address:'', gstNumber:'', companyName:'', notes:'' });
  const load = () => api('/customers').then(setList);
  useEffect(() => { load(); }, []);

  async function save() {
    if (!form.name || !form.mobile) return toast.error('Name & mobile required');
    await api('/customers', { method: 'POST', body: JSON.stringify(form) });
    toast.success('Customer saved');
    setOpen(false); setForm({ name:'', mobile:'', email:'', address:'', gstNumber:'', companyName:'', notes:'' });
    load();
  }
  async function openDetail(id) {
    const d = await api(`/customers/${id}`); setSelected(d);
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Customers</h1><p className="text-sm text-muted-foreground">CRM with full booking & payment history.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-emerald-600 hover:bg-emerald-700"><Plus className="size-4 mr-1"/>Add Customer</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({...form, name:e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Mobile</Label><Input value={form.mobile} onChange={e => setForm({...form, mobile:e.target.value})} /></div>
                <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({...form, email:e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Company</Label><Input value={form.companyName} onChange={e => setForm({...form, companyName:e.target.value})} /></div>
                <div><Label>GST Number</Label><Input value={form.gstNumber} onChange={e => setForm({...form, gstNumber:e.target.value})} /></div>
              </div>
              <div><Label>Address</Label><Textarea value={form.address} onChange={e => setForm({...form, address:e.target.value})} /></div>
            </div>
            <DialogFooter><Button onClick={save} className="bg-emerald-600 hover:bg-emerald-700">Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Mobile</TableHead><TableHead>Email</TableHead><TableHead>Company</TableHead><TableHead>GST</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {list.map(c => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => openDetail(c.id)}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell>{c.mobile}</TableCell>
                  <TableCell>{c.email||'-'}</TableCell>
                  <TableCell>{c.companyName||'-'}</TableCell>
                  <TableCell className="font-mono text-xs">{c.gstNumber||'-'}</TableCell>
                  <TableCell><Button variant="ghost" size="sm">View</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader><DialogTitle>{selected.customer.name}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Total Bookings" value={selected.stats.totalBookings} icon={CalendarDays} />
                <Kpi label="Total Revenue" value={fmtINR(selected.stats.totalRevenue)} icon={IndianRupee} />
                <Kpi label="Pending" value={fmtINR(selected.stats.pending)} icon={Wallet} accent="rose" />
                <Kpi label="Hours Played" value={`${selected.stats.totalHours} hr`} icon={Clock} accent="blue" />
              </div>
              <Tabs defaultValue="bookings" className="mt-4">
                <TabsList><TabsTrigger value="bookings">Bookings</TabsTrigger><TabsTrigger value="invoices">Invoices</TabsTrigger><TabsTrigger value="payments">Payments</TabsTrigger></TabsList>
                <TabsContent value="bookings">
                  <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Sport</TableHead><TableHead>Time</TableHead><TableHead>Total</TableHead></TableRow></TableHeader>
                    <TableBody>{selected.bookings.map(b => <TableRow key={b.id}><TableCell>{b.bookingDate}</TableCell><TableCell>{b.sport}</TableCell><TableCell>{b.startTime}-{b.endTime}</TableCell><TableCell>{fmtINR(b.totalAmount)}</TableCell></TableRow>)}</TableBody>
                  </Table>
                </TabsContent>
                <TabsContent value="invoices">
                  <Table><TableHeader><TableRow><TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Total</TableHead><TableHead>Paid</TableHead><TableHead>Balance</TableHead></TableRow></TableHeader>
                    <TableBody>{selected.invoices.map(i => <TableRow key={i.id}><TableCell className="font-mono text-xs">{i.invoiceNumber}</TableCell><TableCell>{i.bookingDate}</TableCell><TableCell>{fmtINR(i.totalAmount)}</TableCell><TableCell className="text-emerald-700">{fmtINR(i.paidAmount)}</TableCell><TableCell className="text-rose-600">{fmtINR(i.balance)}</TableCell></TableRow>)}</TableBody>
                  </Table>
                </TabsContent>
                <TabsContent value="payments">
                  <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Invoice</TableHead><TableHead>Mode</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader>
                    <TableBody>{selected.payments.map(p => <TableRow key={p.id}><TableCell>{p.at?.slice(0,10)}</TableCell><TableCell className="font-mono text-xs">{p.invoiceNumber}</TableCell><TableCell>{p.mode}</TableCell><TableCell>{fmtINR(p.amount)}</TableCell></TableRow>)}</TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----------------- INVOICES -----------------
function InvoiceView({ invoice, company, payments, onClose }) {
  function printInvoice() { window.print(); }
  return (
    <Dialog open={!!invoice} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto print:!max-w-none print:!shadow-none">
        <div id="invoice-print" className="bg-white p-6 print:p-0">
          <div className="flex items-start justify-between border-b pb-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="size-10 rounded-lg bg-emerald-600 text-white grid place-items-center font-bold">N</div>
                <div>
                  <h1 className="text-xl font-bold">{company?.name}</h1>
                  <p className="text-xs text-muted-foreground">{company?.address}</p>
                </div>
              </div>
              <p className="text-xs">GSTIN: <span className="font-mono">{company?.gstNumber}</span> · {company?.phone}</p>
            </div>
            <div className="text-right">
              <h2 className="text-2xl font-bold text-emerald-700">{invoice.isGst ? 'TAX INVOICE' : 'INVOICE'}</h2>
              <p className="text-sm font-mono">{invoice.invoiceNumber}</p>
              <p className="text-xs text-muted-foreground">Dated: {invoice.bookingDate}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
            <div>
              <p className="text-xs uppercase text-muted-foreground mb-1">Bill To</p>
              <p className="font-semibold">{invoice.customerName}</p>
              <p>{invoice.mobile}</p>
              <p>{invoice.email}</p>
              {invoice.gstNumber && <p>GSTIN: <span className="font-mono">{invoice.gstNumber}</span></p>}
            </div>
            <div>
              <p className="text-xs uppercase text-muted-foreground mb-1">Booking</p>
              <p>Ref: <span className="font-mono">{invoice.bookingRef}</span></p>
              <p>Date: {invoice.bookingDate}</p>
              <p>Slot: {invoice.startTime} - {invoice.endTime}</p>
              <p>Sport: {invoice.sport}</p>
            </div>
          </div>
          <table className="w-full text-sm border">
            <thead className="bg-emerald-50">
              <tr><th className="p-2 text-left">Description</th><th className="p-2 text-right">Hours</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Amount</th></tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="p-2">{invoice.sport} turf booking ({invoice.startTime} - {invoice.endTime})</td>
                <td className="p-2 text-right">{invoice.totalHours}</td>
                <td className="p-2 text-right">{fmtINR(invoice.ratePerHour)}</td>
                <td className="p-2 text-right">{fmtINR(invoice.subtotal)}</td>
              </tr>
            </tbody>
          </table>
          <div className="flex justify-end mt-4">
            <div className="w-72 text-sm space-y-1">
              <div className="flex justify-between"><span>Subtotal</span><span>{fmtINR(invoice.subtotal)}</span></div>
              {invoice.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{fmtINR(invoice.discount)}</span></div>}
              <div className="flex justify-between"><span>CGST ({(invoice.gstRate/2).toFixed(1)}%)</span><span>{fmtINR(invoice.tax/2)}</span></div>
              <div className="flex justify-between"><span>SGST ({(invoice.gstRate/2).toFixed(1)}%)</span><span>{fmtINR(invoice.tax/2)}</span></div>
              <Separator />
              <div className="flex justify-between text-base font-bold"><span>Grand Total</span><span>{fmtINR(invoice.totalAmount)}</span></div>
              <div className="flex justify-between text-emerald-700"><span>Paid</span><span>{fmtINR(invoice.paidAmount)}</span></div>
              <div className="flex justify-between text-rose-700 font-bold"><span>Balance Due</span><span>{fmtINR(invoice.balance)}</span></div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-6 border-t pt-2 text-center">Thank you for choosing {company?.brand}. This is a computer-generated invoice.</p>
        </div>
        <DialogFooter className="print:hidden">
          <Button variant="outline" onClick={printInvoice}><Printer className="size-4 mr-1"/>Print / Save PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Invoices() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(null);
  const [payOpen, setPayOpen] = useState(null);
  const [payForm, setPayForm] = useState({ amount: 0, mode: 'Cash', notes: '' });
  const load = () => api('/invoices').then(setList);
  useEffect(() => { load(); }, []);
  async function openInv(id) { const d = await api(`/invoices/${id}`); setOpen(d); }
  async function recordPayment() {
    if (!payOpen) return;
    try {
      await api('/payments', { method: 'POST', body: JSON.stringify({ invoiceId: payOpen.id, amount: Number(payForm.amount), mode: payForm.mode, notes: payForm.notes }) });
      toast.success('Payment recorded');
      setPayOpen(null); setPayForm({ amount: 0, mode: 'Cash', notes: '' });
      load();
    } catch (e) { toast.error(e.message); }
  }
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Invoices</h1><p className="text-sm text-muted-foreground">All GST & non-GST invoices.</p></div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Invoice #</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Sport</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Balance</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {list.map(i => (
              <TableRow key={i.id}>
                <TableCell className="font-mono text-xs">{i.invoiceNumber}</TableCell>
                <TableCell>{i.bookingDate}</TableCell>
                <TableCell>{i.customerName}</TableCell>
                <TableCell>{i.sport}</TableCell>
                <TableCell className="text-right">{fmtINR(i.totalAmount)}</TableCell>
                <TableCell className="text-right text-emerald-700">{fmtINR(i.paidAmount)}</TableCell>
                <TableCell className="text-right text-rose-600 font-medium">{fmtINR(i.balance)}</TableCell>
                <TableCell className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => openInv(i.id)}>View</Button>
                  {i.balance > 0 && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setPayOpen(i); setPayForm({ amount: i.balance, mode: 'Cash', notes: '' }); }}>Record Payment</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      {open && <InvoiceView invoice={open.invoice} company={open.company} payments={open.payments} onClose={() => setOpen(null)} />}
      <Dialog open={!!payOpen} onOpenChange={() => setPayOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Record Payment · {payOpen?.invoiceNumber}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Amount</Label><Input type="number" value={payForm.amount} onChange={e => setPayForm({...payForm, amount:e.target.value})} /></div>
            <div>
              <Label>Mode</Label>
              <Select value={payForm.mode} onValueChange={v => setPayForm({...payForm, mode:v})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{['Cash','UPI','Google Pay','PhonePe','Paytm','Card','Bank Transfer','Cheque'].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea value={payForm.notes} onChange={e => setPayForm({...payForm, notes:e.target.value})} /></div>
          </div>
          <DialogFooter><Button onClick={recordPayment} className="bg-emerald-600 hover:bg-emerald-700">Save Payment</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----------------- PAYMENTS -----------------
function Payments() {
  const [list, setList] = useState([]);
  useEffect(() => { api('/payments').then(setList); }, []);
  const total = list.reduce((s,p) => s + (p.amount||0), 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Payments</h1><p className="text-sm text-muted-foreground">All collected payments.</p></div>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Collected</p><p className="text-2xl font-bold text-emerald-700">{fmtINR(total)}</p></CardContent></Card>
      </div>
      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Invoice</TableHead><TableHead>Customer</TableHead><TableHead>Mode</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>{list.map(p => <TableRow key={p.id}><TableCell>{p.at?.slice(0,16).replace('T',' ')}</TableCell><TableCell className="font-mono text-xs">{p.invoiceNumber}</TableCell><TableCell>{p.customerName}</TableCell><TableCell><Badge variant="outline">{p.mode}</Badge></TableCell><TableCell className="text-right font-medium text-emerald-700">{fmtINR(p.amount)}</TableCell></TableRow>)}</TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

// ----------------- EXPENSES -----------------
function Expenses() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: todayStr(), category: 'Electricity', vendor:'', description:'', amount: 0 });
  const load = () => api('/expenses').then(setList);
  useEffect(() => { load(); }, []);
  async function save() {
    await api('/expenses', { method: 'POST', body: JSON.stringify(form) });
    toast.success('Expense saved'); setOpen(false); load();
  }
  async function del(id) { await api(`/expenses/${id}`, { method: 'DELETE' }); load(); }
  const total = list.reduce((s,e) => s + (e.amount||0), 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Expenses</h1><p className="text-sm text-muted-foreground">Track all operational expenses.</p></div>
        <div className="flex gap-3 items-center">
          <Card><CardContent className="p-3 px-4"><p className="text-xs text-muted-foreground">Total Expenses</p><p className="text-lg font-bold text-rose-600">{fmtINR(total)}</p></CardContent></Card>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="bg-emerald-600 hover:bg-emerald-700"><Plus className="size-4 mr-1"/>New Expense</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Expense</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm({...form,date:e.target.value})} /></div>
                  <div><Label>Category</Label>
                    <Select value={form.category} onValueChange={v => setForm({...form, category:v})}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>{['Electricity','Water','Salary','Rent','Maintenance','Equipment','Marketing','Miscellaneous'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Vendor</Label><Input value={form.vendor} onChange={e => setForm({...form, vendor:e.target.value})} /></div>
                <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({...form, description:e.target.value})} /></div>
                <div><Label>Amount</Label><Input type="number" value={form.amount} onChange={e => setForm({...form, amount:e.target.value})} /></div>
              </div>
              <DialogFooter><Button onClick={save} className="bg-emerald-600 hover:bg-emerald-700">Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Vendor</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>{list.map(e => <TableRow key={e.id}><TableCell>{e.date}</TableCell><TableCell><Badge variant="outline">{e.category}</Badge></TableCell><TableCell>{e.vendor}</TableCell><TableCell className="text-sm text-muted-foreground">{e.description}</TableCell><TableCell className="text-right text-rose-600">{fmtINR(e.amount)}</TableCell><TableCell><Button size="icon" variant="ghost" onClick={() => del(e.id)}><Trash2 className="size-4 text-rose-500"/></Button></TableCell></TableRow>)}</TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

// ----------------- REPORTS -----------------
function Reports() {
  const [from, setFrom] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10); });
  const [to, setTo] = useState(todayStr());
  const [pnl, setPnl] = useState(null);
  const [gst, setGst] = useState(null);
  async function run() {
    setPnl(await api(`/reports/pnl?from=${from}&to=${to}`));
    setGst(await api(`/reports/gst?from=${from}&to=${to}`));
  }
  useEffect(() => { run(); /* eslint-disable-next-line */ }, []);

  function exportCSV() {
    if (!gst) return;
    const headers = ['Invoice #','Date','Customer','GSTIN','Sport','Taxable','CGST','SGST','Total'];
    const rows = gst.invoices.map(i => [i.invoiceNumber, i.bookingDate, i.customerName, i.gstNumber||'', i.sport, (i.subtotal||0)-(i.discount||0), (i.tax||0)/2, (i.tax||0)/2, i.totalAmount]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `GST-${from}_to_${to}.csv`; a.click();
  }

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Reports & GST</h1><p className="text-sm text-muted-foreground">Profit & loss, GST summary, exports.</p></div>
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div><Label>From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <Button onClick={run} className="bg-emerald-600 hover:bg-emerald-700">Generate</Button>
          <Button variant="outline" onClick={exportCSV}><Download className="size-4 mr-1"/>Export GST CSV</Button>
        </CardContent>
      </Card>
      {pnl && (
        <div className="grid md:grid-cols-4 gap-4">
          <Kpi label="Revenue (net)" value={fmtINR(pnl.revenue)} icon={TrendingUp} accent="emerald" />
          <Kpi label="Total w/ GST" value={fmtINR(pnl.totalRevenue)} icon={IndianRupee} accent="blue" />
          <Kpi label="Expenses" value={fmtINR(pnl.expense)} icon={Wallet} accent="rose" />
          <Kpi label={pnl.net >= 0 ? 'Net Profit' : 'Net Loss'} value={fmtINR(pnl.net)} icon={CircleDollarSign} accent={pnl.net >= 0 ? 'emerald' : 'rose'} />
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        {pnl && (
          <Card>
            <CardHeader><CardTitle>Expense Breakdown</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer>
                <BarChart data={Object.entries(pnl.expenseByCat).map(([name,value]) => ({name,value}))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={v => fmtINR(v)} />
                  <Bar dataKey="value" fill="#ef4444" radius={[6,6,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {gst && (
          <Card>
            <CardHeader><CardTitle>GST Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Taxable Turnover</span><span className="font-medium">{fmtINR(gst.taxable)}</span></div>
              <div className="flex justify-between"><span>CGST</span><span>{fmtINR(gst.cgst)}</span></div>
              <div className="flex justify-between"><span>SGST</span><span>{fmtINR(gst.sgst)}</span></div>
              <div className="flex justify-between"><span>IGST</span><span>{fmtINR(gst.igst)}</span></div>
              <Separator />
              <div className="flex justify-between font-bold"><span>Total Tax Liability</span><span>{fmtINR(gst.totalTax)}</span></div>
              <div className="flex justify-between text-emerald-700"><span>Tax Collected (Paid)</span><span>{fmtINR(gst.paidTax)}</span></div>
              <div className="flex justify-between text-rose-600"><span>Pending Tax</span><span>{fmtINR(gst.pendingTax)}</span></div>
              <Separator />
              <div className="flex justify-between"><span>Total Invoices</span><span className="font-medium">{gst.count}</span></div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ----------------- STAFF -----------------
function Staff() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ userId:'', name:'', email:'', mobile:'', role:'Staff', password:'' });
  const load = () => api('/staff').then(setList);
  useEffect(() => { load(); }, []);
  async function save() {
    try { await api('/staff', { method: 'POST', body: JSON.stringify(form) });
      toast.success('Staff added'); setOpen(false); setForm({ userId:'', name:'', email:'', mobile:'', role:'Staff', password:'' }); load();
    } catch (e) { toast.error(e.message); }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Staff & Roles</h1><p className="text-sm text-muted-foreground">Manage users and role-based access.</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-emerald-600 hover:bg-emerald-700"><Plus className="size-4 mr-1"/>Add Staff</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Staff</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><Label>User ID</Label><Input value={form.userId} onChange={e => setForm({...form, userId:e.target.value})} /></div>
                <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({...form, name:e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({...form, email:e.target.value})} /></div>
                <div><Label>Mobile</Label><Input value={form.mobile} onChange={e => setForm({...form, mobile:e.target.value})} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Role</Label>
                  <Select value={form.role} onValueChange={v => setForm({...form, role:v})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>{['Super Admin','Manager','Staff','Accountant','Viewer'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Password</Label><Input value={form.password} onChange={e => setForm({...form, password:e.target.value})} /></div>
              </div>
            </div>
            <DialogFooter><Button onClick={save} className="bg-emerald-600 hover:bg-emerald-700">Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="p-0">
        <Table><TableHeader><TableRow><TableHead>User ID</TableHead><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>{list.map(u => <TableRow key={u.id}><TableCell className="font-mono">{u.userId}</TableCell><TableCell>{u.name}</TableCell><TableCell>{u.email||'-'}</TableCell><TableCell><Badge>{u.role}</Badge></TableCell><TableCell><Badge variant={u.status==='active'?'default':'destructive'}>{u.status}</Badge></TableCell></TableRow>)}</TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}

// ----------------- SETTINGS -----------------
function SettingsPage({ user }) {
  const [s, setS] = useState(null);
  const [pw, setPw] = useState({ oldPassword:'', newPassword:'' });
  useEffect(() => { api('/settings').then(setS); }, []);
  async function save() {
    await api('/settings', { method: 'PUT', body: JSON.stringify(s) });
    toast.success('Settings saved');
  }
  async function changePw() {
    if (!pw.oldPassword || !pw.newPassword) return toast.error('Enter both passwords');
    try { await api('/auth/change-password', { method: 'POST', body: JSON.stringify(pw) });
      toast.success('Password changed'); setPw({ oldPassword:'', newPassword:'' });
    } catch (e) { toast.error(e.message); }
  }
  if (!s) return null;
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Settings</h1><p className="text-sm text-muted-foreground">Company information, GST, invoicing & security.</p></div>
      <Tabs defaultValue="company">
        <TabsList><TabsTrigger value="company">Company</TabsTrigger><TabsTrigger value="invoice">Invoice</TabsTrigger><TabsTrigger value="security">Security</TabsTrigger><TabsTrigger value="integrations">Integrations</TabsTrigger></TabsList>
        <TabsContent value="company">
          <Card><CardContent className="p-6 space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <div><Label>Brand Name</Label><Input value={s.brand||''} onChange={e => setS({...s, brand:e.target.value})} /></div>
              <div><Label>Registered Name</Label><Input value={s.name||''} onChange={e => setS({...s, name:e.target.value})} /></div>
              <div><Label>GSTIN</Label><Input value={s.gstNumber||''} onChange={e => setS({...s, gstNumber:e.target.value})} /></div>
              <div><Label>Phone</Label><Input value={s.phone||''} onChange={e => setS({...s, phone:e.target.value})} /></div>
              <div><Label>Email</Label><Input value={s.email||''} onChange={e => setS({...s, email:e.target.value})} /></div>
              <div><Label>GST Rate %</Label><Input type="number" value={s.gstRate||18} onChange={e => setS({...s, gstRate:Number(e.target.value)})} /></div>
            </div>
            <div><Label>Address</Label><Textarea value={s.address||''} onChange={e => setS({...s, address:e.target.value})} /></div>
            <Button onClick={save} className="bg-emerald-600 hover:bg-emerald-700">Save</Button>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="invoice">
          <Card><CardContent className="p-6 space-y-3">
            <div className="grid md:grid-cols-3 gap-3">
              <div><Label>Invoice Prefix</Label><Input value={s.invoicePrefix||''} onChange={e => setS({...s, invoicePrefix:e.target.value})} /></div>
              <div><Label>Financial Year</Label><Input value={s.financialYear||''} onChange={e => setS({...s, financialYear:e.target.value})} /></div>
              <div><Label>Current Counter</Label><Input type="number" value={s.invoiceCounter||0} onChange={e => setS({...s, invoiceCounter:Number(e.target.value)})} /></div>
            </div>
            <p className="text-sm text-muted-foreground">Next invoice number will be: <span className="font-mono font-medium">{s.invoicePrefix}-{s.financialYear}-{String((s.invoiceCounter||0)+1).padStart(6,'0')}</span></p>
            <Button onClick={save} className="bg-emerald-600 hover:bg-emerald-700">Save</Button>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="security">
          <Card><CardContent className="p-6 space-y-3 max-w-md">
            <div><Label>Old Password</Label><Input type="password" value={pw.oldPassword} onChange={e => setPw({...pw, oldPassword:e.target.value})} /></div>
            <div><Label>New Password</Label><Input type="password" value={pw.newPassword} onChange={e => setPw({...pw, newPassword:e.target.value})} /></div>
            <Button onClick={changePw} className="bg-emerald-600 hover:bg-emerald-700"><KeyRound className="size-4 mr-1"/>Change Password</Button>
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="integrations">
          <Card><CardContent className="p-6 space-y-2 text-sm">
            <p className="text-muted-foreground">PlayO & District app integration framework is scaffolded. Provide API credentials in the next iteration to enable automatic booking sync.</p>
            <div className="grid md:grid-cols-2 gap-3">
              <div><Label>PlayO API Key</Label><Input placeholder="(not set)" disabled /></div>
              <div><Label>PlayO Webhook URL</Label><Input value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/integrations/playo`} readOnly /></div>
              <div><Label>District API Key</Label><Input placeholder="(not set)" disabled /></div>
              <div><Label>District Webhook URL</Label><Input value={`${typeof window !== 'undefined' ? window.location.origin : ''}/api/integrations/district`} readOnly /></div>
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ----------------- APP SHELL -----------------
const NAV = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'bookings', label: 'Bookings', icon: CalendarDays },
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'invoices', label: 'Invoices', icon: FileText },
  { key: 'payments', label: 'Payments', icon: Receipt },
  { key: 'expenses', label: 'Expenses', icon: Wallet },
  { key: 'reports', label: 'Reports & GST', icon: FileBarChart },
  { key: 'staff', label: 'Staff & Roles', icon: Shield },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

function Shell({ user, onLogout }) {
  const [tab, setTab] = useState('dashboard');
  const [open, setOpen] = useState(false);
  const NavItem = ({ k, label, Icon }) => (
    <button onClick={() => { setTab(k); setOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${tab===k ? 'bg-emerald-600 text-white shadow' : 'hover:bg-emerald-50 text-zinc-700'}`}>
      <Icon className="size-4" /> {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      <aside className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r flex flex-col transition-transform ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <div className="size-10 rounded-lg bg-emerald-600 text-white grid place-items-center font-bold">N</div>
            <div>
              <h1 className="font-bold leading-tight">NexTurf <span className="text-emerald-600">ERP</span></h1>
              <p className="text-[10px] text-muted-foreground">Athletixcel Sports</p>
            </div>
          </div>
        </div>
        <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
          {NAV.map(n => <NavItem key={n.key} k={n.key} label={n.label} Icon={n.icon} />)}
        </nav>
        <div className="p-3 border-t">
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-zinc-50">
            <div className="size-8 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center text-xs font-bold">{user.name?.[0]||'U'}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{user.role}</p>
            </div>
            <Button size="icon" variant="ghost" onClick={onLogout}><LogOut className="size-4"/></Button>
          </div>
        </div>
      </aside>
      {open && <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setOpen(false)} />}
      <main className="flex-1 min-w-0">
        <header className="h-14 border-b bg-white px-4 flex items-center gap-3 sticky top-0 z-20">
          <Button size="icon" variant="ghost" className="lg:hidden" onClick={() => setOpen(true)}><Menu className="size-5"/></Button>
          <div className="relative flex-1 max-w-md">
            <Search className="size-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input className="pl-9 h-9 bg-zinc-50 border-zinc-200" placeholder="Global search (bookings, customers, invoices)..." />
          </div>
          <Badge variant="outline" className="hidden sm:inline-flex"><Building2 className="size-3 mr-1"/>Athletixcel Sports</Badge>
        </header>
        <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
          {tab === 'dashboard' && <Dashboard />}
          {tab === 'bookings' && <Bookings />}
          {tab === 'customers' && <Customers />}
          {tab === 'invoices' && <Invoices />}
          {tab === 'payments' && <Payments />}
          {tab === 'expenses' && <Expenses />}
          {tab === 'reports' && <Reports />}
          {tab === 'staff' && <Staff />}
          {tab === 'settings' && <SettingsPage user={user} />}
        </div>
      </main>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = localStorage.getItem('nxt_token');
    const u = localStorage.getItem('nxt_user');
    if (t && u) {
      api('/auth/me').then(setUser).catch(() => { localStorage.clear(); }).finally(() => setReady(true));
    } else setReady(true);
  }, []);
  function logout() { localStorage.removeItem('nxt_token'); localStorage.removeItem('nxt_user'); setUser(null); toast.success('Logged out'); }
  if (!ready) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading NexTurf...</div>;
  if (!user) return <LoginPage onLogin={setUser} />;
  return <Shell user={user} onLogout={logout} />;
}

export default App;
