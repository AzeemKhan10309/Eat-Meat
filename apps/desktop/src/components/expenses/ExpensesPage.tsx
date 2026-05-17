import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
  Plus, Search, Filter, RefreshCw, Pencil, Trash2,
  TrendingUp, TrendingDown, Receipt, Download, X, ChevronLeft, ChevronRight,
  Wallet, Calendar, AlertCircle,
} from 'lucide-react';
import api from '@/services/api';
import { Button, Input, Card, CardHeader, CardTitle, CardContent, Badge, StatCard } from '@/components/ui';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import toast from 'react-hot-toast';

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'ELECTRICITY',  label: 'Electricity' },
  { value: 'RENT',         label: 'Rent' },
  { value: 'STAFF_SALARY', label: 'Staff Salary' },
  { value: 'INTERNET',     label: 'Internet' },
  { value: 'MAINTENANCE',  label: 'Maintenance' },
  { value: 'DELIVERY',     label: 'Delivery' },
  { value: 'MARKETING',    label: 'Marketing' },
  { value: 'SUPPLIES',     label: 'Supplies' },
  { value: 'UTILITIES',    label: 'Utilities' },
  { value: 'TRANSPORT',    label: 'Transport' },
  { value: 'EQUIPMENT',    label: 'Equipment' },
  { value: 'MISCELLANEOUS',label: 'Miscellaneous' },
];

const PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA', 'CHEQUE', 'OTHER'];
const RECURRING_OPTIONS = [
  { value: 'NONE',    label: 'One-time' },
  { value: 'DAILY',   label: 'Daily' },
  { value: 'WEEKLY',  label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
];

const COLORS = ['#f97316','#3b82f6','#22c55e','#a855f7','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16','#8b5cf6','#14b8a6','#64748b'];

const CAT_COLOR: Record<string, string> = {
  ELECTRICITY:'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  RENT:        'bg-blue-500/10 text-blue-400 border-blue-500/20',
  STAFF_SALARY:'bg-purple-500/10 text-purple-400 border-purple-500/20',
  INTERNET:    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  MAINTENANCE: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  DELIVERY:    'bg-green-500/10 text-green-400 border-green-500/20',
  MARKETING:   'bg-pink-500/10 text-pink-400 border-pink-500/20',
  SUPPLIES:    'bg-amber-500/10 text-amber-400 border-amber-500/20',
  UTILITIES:   'bg-teal-500/10 text-teal-400 border-teal-500/20',
  TRANSPORT:   'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  EQUIPMENT:   'bg-red-500/10 text-red-400 border-red-500/20',
  MISCELLANEOUS:'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const categoryLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label ?? cat;

// ── Types ────────────────────────────────────────────────────────────────────

interface Expense {
  id: string; title: string; category: string; description?: string;
  amount: number; expenseDate: string; paymentMethod: string;
  recurring: string; receiptUrl?: string;
  addedBy?: { name: string };
}

const blankForm = () => ({
  title: '', category: 'MISCELLANEOUS', description: '',
  amount: '', expenseDate: new Date().toISOString().slice(0, 10),
  paymentMethod: 'CASH', recurring: 'NONE',
});

type Tab = 'list' | 'dashboard' | 'reports';

// ── Helpers ──────────────────────────────────────────────────────────────────

function exportCSV(data: Expense[], filename: string) {
  const headers = ['Title','Category','Amount','Date','Payment Method','Recurring','Added By','Description'];
  const rows = data.map(e => [
    e.title, categoryLabel(e.category), e.amount,
    new Date(e.expenseDate).toLocaleDateString('en-GB'),
    e.paymentMethod, e.recurring, e.addedBy?.name ?? '',
    e.description ?? '',
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click(); URL.revokeObjectURL(url);
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ExpensesPage() {
  const qc = useQueryClient();
  const now = new Date();

  const [tab,    setTab]    = useState<Tab>('list');
  const [page,   setPage]   = useState(1);
  const [search, setSearch] = useState('');
  const [filterCat,  setFilterCat]  = useState('');
  const [filterPay,  setFilterPay]  = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo,   setFilterTo]   = useState('');
  const [summaryMonth, setSummaryMonth] = useState(now.getMonth() + 1);
  const [summaryYear,  setSummaryYear]  = useState(now.getFullYear());
  const [reportFrom, setReportFrom] = useState(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
  const [reportTo,   setReportTo]   = useState(now.toISOString().slice(0, 10));

  const [showModal, setShowModal] = useState(false);
  const [editing,   setEditing]   = useState<Expense | null>(null);
  const [form,      setForm]      = useState(blankForm());
  const [deleteId,  setDeleteId]  = useState<string | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const expenseQuery = useQuery({
    queryKey: ['expenses', page, search, filterCat, filterPay, filterFrom, filterTo],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), limit: '20' });
      if (search)     p.set('search',        search);
      if (filterCat)  p.set('category',      filterCat);
      if (filterPay)  p.set('paymentMethod', filterPay);
      if (filterFrom) p.set('dateFrom',      filterFrom);
      if (filterTo)   p.set('dateTo',        filterTo);
      return api.get(`/expenses?${p}`).then(r => r.data);
    },
    enabled: tab === 'list',
  });

  const summaryQuery = useQuery({
    queryKey: ['expense-summary', summaryMonth, summaryYear],
    queryFn: () => api.get(`/expenses/summary?month=${summaryMonth}&year=${summaryYear}`).then(r => r.data.data),
    enabled: tab === 'dashboard',
  });

  const yearlyQuery = useQuery({
    queryKey: ['expense-yearly', summaryYear],
    queryFn: () => api.get(`/expenses/yearly?year=${summaryYear}`).then(r => r.data.data),
    enabled: tab === 'dashboard',
  });

  const reportQuery = useQuery({
    queryKey: ['expense-report', reportFrom, reportTo],
    queryFn: () => api.get(`/expenses/report?dateFrom=${reportFrom}&dateTo=${reportTo}`).then(r => r.data.data),
    enabled: tab === 'reports',
  });

  const expenses: Expense[] = expenseQuery.data?.data || [];
  const total      = expenseQuery.data?.total || 0;
  const totalPages = expenseQuery.data?.totalPages || 1;
  const summary    = summaryQuery.data;
  const yearly     = yearlyQuery.data || [];
  const report     = reportQuery.data;

  // ── Mutations ──────────────────────────────────────────────────────────────

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['expense-summary'] });
    qc.invalidateQueries({ queryKey: ['expense-yearly'] });
    qc.invalidateQueries({ queryKey: ['expense-report'] });
  };

  const createMut = useMutation({
    mutationFn: () => api.post('/expenses', { ...form, amount: parseFloat(form.amount) }),
    onSuccess: () => { toast.success('Expense added'); closeModal(); invalidate(); },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message || 'Failed to add expense'),
  });

  const updateMut = useMutation({
    mutationFn: () => api.patch(`/expenses/${editing!.id}`, { ...form, amount: parseFloat(form.amount) }),
    onSuccess: () => { toast.success('Expense updated'); closeModal(); invalidate(); },
    onError: (e: { response?: { data?: { message?: string } } }) =>
      toast.error(e?.response?.data?.message || 'Failed to update expense'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => { toast.success('Expense deleted'); setDeleteId(null); invalidate(); },
    onError: () => toast.error('Failed to delete expense'),
  });

  // ── Modal helpers ──────────────────────────────────────────────────────────

  const openAdd = () => { setEditing(null); setForm(blankForm()); setShowModal(true); };
  const openEdit = (e: Expense) => {
    setEditing(e);
    setForm({
      title: e.title, category: e.category, description: e.description ?? '',
      amount: String(e.amount), expenseDate: e.expenseDate.slice(0, 10),
      paymentMethod: e.paymentMethod, recurring: e.recurring,
    });
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditing(null); };
  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submitForm = () => {
    if (!form.title.trim())   return toast.error('Title is required');
    if (!form.amount || parseFloat(form.amount) <= 0) return toast.error('Enter a valid amount');
    if (!form.expenseDate)    return toast.error('Date is required');
    editing ? updateMut.mutate() : createMut.mutate();
  };

  const monthName = (m: number, y: number) =>
    new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  const prevMonth = () => {
    if (summaryMonth === 1) { setSummaryMonth(12); setSummaryYear(y => y - 1); }
    else setSummaryMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (summaryMonth === 12) { setSummaryMonth(1); setSummaryYear(y => y + 1); }
    else setSummaryMonth(m => m + 1);
  };

  const isPending = createMut.isPending || updateMut.isPending;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* Header */}
      <div className="px-5 py-3 border-b border-border/60 flex items-center gap-4 flex-shrink-0">
        {/* Tabs */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {(['list','dashboard','reports'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('px-4 py-1.5 text-xs font-medium capitalize transition-colors',
                tab === t ? 'bg-orange-500 text-white' : 'text-muted-foreground hover:text-foreground')}
            >{t}</button>
          ))}
        </div>

        <div className="ml-auto">
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4" />
            Add Expense
          </Button>
        </div>
      </div>

      {/* ── LIST TAB ─────────────────────────────────────────────────────── */}
      {tab === 'list' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Filters */}
          <div className="px-5 py-2.5 border-b border-border/60 flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Search expenses…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              leftIcon={<Search className="w-3.5 h-3.5" />}
              className="w-48"
            />
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }}
              className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none">
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select value={filterPay} onChange={e => { setFilterPay(e.target.value); setPage(1); }}
              className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none">
              <option value="">All Payment Methods</option>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
            </select>
            <input type="date" value={filterFrom} onChange={e => { setFilterFrom(e.target.value); setPage(1); }}
              className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none" />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="date" value={filterTo} onChange={e => { setFilterTo(e.target.value); setPage(1); }}
              className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs text-foreground outline-none" />
            {(filterCat || filterPay || filterFrom || filterTo) && (
              <button onClick={() => { setFilterCat(''); setFilterPay(''); setFilterFrom(''); setFilterTo(''); setPage(1); }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
            <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              {total} expenses
              <button onClick={() => qc.invalidateQueries({ queryKey: ['expenses'] })}
                className="p-1.5 rounded-md hover:bg-accent transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => exportCSV(expenses, `expenses-${new Date().toISOString().slice(0,10)}.csv`)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-border text-xs hover:bg-accent transition-colors"
                disabled={expenses.length === 0}
              >
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card border-b border-border/60">
                <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-5 py-3 text-left font-medium">Title</th>
                  <th className="px-4 py-3 text-left font-medium">Category</th>
                  <th className="px-4 py-3 text-left font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Payment</th>
                  <th className="px-4 py-3 text-left font-medium">Recurring</th>
                  <th className="px-4 py-3 text-left font-medium">Added By</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {expenseQuery.isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                      ))}</tr>
                    ))
                  : expenses.length === 0
                    ? (
                      <tr><td colSpan={8} className="py-20 text-center text-muted-foreground text-sm">
                        No expenses found
                      </td></tr>
                    )
                    : expenses.map(exp => (
                      <motion.tr key={exp.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="hover:bg-muted/30 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-medium text-foreground text-sm">{exp.title}</p>
                          {exp.description && <p className="text-xs text-muted-foreground truncate max-w-40">{exp.description}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border', CAT_COLOR[exp.category] ?? 'bg-muted text-muted-foreground border-border')}>
                            {categoryLabel(exp.category)}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground">{formatCurrency(exp.amount)}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(exp.expenseDate).toLocaleDateString('en-GB')}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{exp.paymentMethod.replace('_', ' ')}</td>
                        <td className="px-4 py-3">
                          {exp.recurring !== 'NONE' && (
                            <Badge variant="info" className="text-[10px]">{exp.recurring}</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{exp.addedBy?.name ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(exp)}
                              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDeleteId(exp.id)}
                              className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                }
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground flex-shrink-0">
            <span>Page {page} of {totalPages} · {total} total</span>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── DASHBOARD TAB ────────────────────────────────────────────────── */}
      {tab === 'dashboard' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Month selector */}
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-foreground w-44 text-center">{monthName(summaryMonth, summaryYear)}</span>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => { setSummaryMonth(now.getMonth() + 1); setSummaryYear(now.getFullYear()); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1">Today</button>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              label="Total Expenses"
              value={formatCurrency(summary?.total ?? 0)}
              sub={`${summary?.count ?? 0} transactions`}
              icon={<Wallet className="w-5 h-5" />}
              color="brand"
            />
            <StatCard
              label="vs Last Month"
              value={`${summary?.changeVsPrev >= 0 ? '+' : ''}${(summary?.changeVsPrev ?? 0).toFixed(1)}%`}
              sub={formatCurrency(summary?.prevTotal ?? 0) + ' last month'}
              icon={summary?.changeVsPrev >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              trend={-(summary?.changeVsPrev ?? 0)}
              color="blue"
            />
            <StatCard
              label="Largest Category"
              value={summary?.byCategory?.[0]?.label ?? '—'}
              sub={formatCurrency(summary?.byCategory?.[0]?.total ?? 0)}
              icon={<Receipt className="w-5 h-5" />}
              color="amber"
            />
            <StatCard
              label="Daily Average"
              value={formatCurrency(summary?.total ? summary.total / new Date(summaryYear, summaryMonth, 0).getDate() : 0)}
              sub="per day this month"
              icon={<Calendar className="w-5 h-5" />}
              color="green"
            />
          </div>

          <div className="grid grid-cols-3 gap-5">
            {/* Category breakdown */}
            <Card>
              <CardHeader><CardTitle>By Category</CardTitle></CardHeader>
              <CardContent>
                {summary?.byCategory?.length ? (
                  <>
                    <ResponsiveContainer width="100%" height={120}>
                      <PieChart>
                        <Pie data={summary.byCategory} cx="50%" cy="50%" innerRadius={32} outerRadius={52}
                          dataKey="total" paddingAngle={3}>
                          {summary.byCategory.map((_: unknown, i: number) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5 mt-2 max-h-36 overflow-y-auto">
                      {summary.byCategory.map((cat: { category: string; label: string; total: number; percentage: number }, i: number) => (
                        <div key={cat.category} className="flex items-center gap-2 text-xs">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="flex-1 truncate text-muted-foreground">{cat.label}</span>
                          <span className="text-muted-foreground">{cat.percentage.toFixed(0)}%</span>
                          <span className="font-medium text-foreground">{formatCurrency(cat.total)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-40 text-muted-foreground text-xs">No data</div>
                )}
              </CardContent>
            </Card>

            {/* Yearly comparison bar chart */}
            <Card className="col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Monthly Expenses {summaryYear}</CardTitle>
                  <div className="flex gap-1">
                    <button onClick={() => setSummaryYear(y => y - 1)} className="px-2 py-1 text-xs rounded hover:bg-accent text-muted-foreground">‹</button>
                    <span className="text-xs text-muted-foreground px-1 py-1">{summaryYear}</span>
                    <button onClick={() => setSummaryYear(y => y + 1)} className="px-2 py-1 text-xs rounded hover:bg-accent text-muted-foreground">›</button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={yearly} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `Rs${v}`} />
                    <Tooltip formatter={(v: number) => [formatCurrency(v), 'Expenses']} />
                    <Bar dataKey="total" fill="#f97316" radius={[3, 3, 0, 0]}
                      // Highlight current month
                      label={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Payment method breakdown */}
          {summary?.byPaymentMethod?.length > 0 && (
            <Card>
              <CardHeader><CardTitle>By Payment Method</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {summary.byPaymentMethod.map((pm: { method: string; amount: number; percentage: number }, i: number) => (
                    <div key={pm.method} className="p-3 rounded-lg bg-muted/40 border border-border/40">
                      <div className="text-xs text-muted-foreground mb-1">{pm.method.replace('_', ' ')}</div>
                      <div className="text-sm font-semibold text-foreground">{formatCurrency(pm.amount)}</div>
                      <div className="mt-1.5 h-1 bg-muted rounded-full">
                        <div className="h-1 rounded-full" style={{ width: `${pm.percentage}%`, background: COLORS[i % COLORS.length] }} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1">{pm.percentage.toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── REPORTS TAB ──────────────────────────────────────────────────── */}
      {tab === 'reports' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Date range */}
          <Card className="p-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">From</label>
                <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)}
                  className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">To</label>
                <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)}
                  className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex gap-2 self-end">
                {['This Month', 'Last Month', 'This Year'].map(label => (
                  <button key={label} onClick={() => {
                    if (label === 'This Month') {
                      setReportFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10));
                      setReportTo(now.toISOString().slice(0,10));
                    } else if (label === 'Last Month') {
                      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                      setReportFrom(lm.toISOString().slice(0,10));
                      setReportTo(new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0,10));
                    } else {
                      setReportFrom(`${now.getFullYear()}-01-01`);
                      setReportTo(now.toISOString().slice(0,10));
                    }
                  }}
                    className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                    {label}
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" className="self-end ml-auto"
                disabled={!report || report.expenses.length === 0}
                onClick={() => report && exportCSV(report.expenses, `expense-report-${reportFrom}-${reportTo}.csv`)}>
                <Download className="w-4 h-4" /> Export CSV
              </Button>
            </div>
          </Card>

          {report && (
            <>
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-foreground">{formatCurrency(report.total)}</div>
                  <div className="text-xs text-muted-foreground mt-1">Total Expenses</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-foreground">{report.count}</div>
                  <div className="text-xs text-muted-foreground mt-1">Transactions</div>
                </Card>
                <Card className="p-4 text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {formatCurrency(report.count > 0 ? report.total / report.count : 0)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">Avg per Transaction</div>
                </Card>
              </div>

              {/* Category breakdown */}
              <Card>
                <CardHeader><CardTitle>Category Breakdown</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {report.byCategory.map((cat: { category: string; label: string; total: number; count: number }, i: number) => {
                      const pct = report.total > 0 ? (cat.total / report.total) * 100 : 0;
                      return (
                        <div key={cat.category}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-foreground font-medium">{cat.label}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-muted-foreground">{cat.count} entries</span>
                              <span className="text-muted-foreground">{pct.toFixed(1)}%</span>
                              <span className="font-semibold text-foreground w-24 text-right">{formatCurrency(cat.total)}</span>
                            </div>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full">
                            <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Detail table */}
              <Card>
                <CardHeader><CardTitle>Expense Details</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="border-b border-border/60">
                        <tr className="text-muted-foreground uppercase tracking-wider">
                          <th className="px-4 py-2.5 text-left font-medium">Title</th>
                          <th className="px-4 py-2.5 text-left font-medium">Category</th>
                          <th className="px-4 py-2.5 text-left font-medium">Date</th>
                          <th className="px-4 py-2.5 text-left font-medium">Method</th>
                          <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {report.expenses.map((e: Expense) => (
                          <tr key={e.id} className="hover:bg-muted/20">
                            <td className="px-4 py-2.5 text-foreground">{e.title}</td>
                            <td className="px-4 py-2.5">
                              <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-semibold border', CAT_COLOR[e.category] ?? 'bg-muted text-muted-foreground border-border')}>
                                {categoryLabel(e.category)}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">
                              {new Date(e.expenseDate).toLocaleDateString('en-GB')}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">{e.paymentMethod.replace('_',' ')}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-foreground">{formatCurrency(e.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t border-border/60 bg-muted/20">
                        <tr>
                          <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-foreground">Total</td>
                          <td className="px-4 py-2.5 text-right font-bold text-orange-400">{formatCurrency(report.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {!report && (
            <div className="flex flex-col items-center py-20 text-muted-foreground gap-2">
              <AlertCircle className="w-8 h-8 opacity-20" />
              <p className="text-sm">Select a date range to generate the report</p>
            </div>
          )}
        </div>
      )}

      {/* ── ADD / EDIT MODAL ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={e => e.target === e.currentTarget && closeModal()}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
                <h3 className="font-display font-semibold text-foreground">
                  {editing ? 'Edit Expense' : 'Add Expense'}
                </h3>
                <button onClick={closeModal} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Title */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Expense Title *</label>
                  <Input placeholder="e.g. Monthly Electricity Bill" value={form.title}
                    onChange={e => setF('title', e.target.value)} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Category */}
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">Category *</label>
                    <select value={form.category} onChange={e => setF('category', e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">Amount (Rs) *</label>
                    <Input type="number" placeholder="0.00" min="0" step="0.01" value={form.amount}
                      onChange={e => setF('amount', e.target.value)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Date */}
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">Expense Date *</label>
                    <input type="date" value={form.expenseDate} onChange={e => setF('expenseDate', e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring" />
                  </div>

                  {/* Payment method */}
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1.5">Payment Method *</label>
                    <select value={form.paymentMethod} onChange={e => setF('paymentMethod', e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                </div>

                {/* Recurring */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Recurring</label>
                  <div className="flex gap-2">
                    {RECURRING_OPTIONS.map(r => (
                      <button key={r.value} onClick={() => setF('recurring', r.value)}
                        className={cn('px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                          form.recurring === r.value
                            ? 'border-orange-500/50 bg-orange-500/10 text-orange-400'
                            : 'border-border text-muted-foreground hover:bg-accent')}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs text-muted-foreground block mb-1.5">Notes / Description</label>
                  <textarea rows={2} placeholder="Optional notes…" value={form.description}
                    onChange={e => setF('description', e.target.value)}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring resize-none" />
                </div>
              </div>

              <div className="flex gap-3 px-6 py-4 border-t border-border/60">
                <Button variant="outline" className="flex-1" onClick={closeModal}>Cancel</Button>
                <Button className="flex-1" isLoading={isPending} onClick={submitForm}>
                  {!isPending && (editing ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />)}
                  {editing ? 'Update' : 'Add Expense'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── DELETE CONFIRM ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {deleteId && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">Delete Expense</h4>
                  <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)}>Cancel</Button>
                <Button variant="destructive" className="flex-1" isLoading={deleteMut.isPending}
                  onClick={() => deleteMut.mutate(deleteId!)}>Delete</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
