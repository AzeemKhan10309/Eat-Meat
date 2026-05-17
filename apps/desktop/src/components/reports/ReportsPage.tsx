import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { Calendar, TrendingUp, Download, Lock } from 'lucide-react';
import api from '@/services/api';
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, StatCard } from '@/components/ui';
import { formatCurrency, cn } from '@/lib/utils';
import toast from 'react-hot-toast';

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'week',  label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'custom',label: 'Custom' },
];
const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ef4444'];

export default function ReportsPage() {
  const [period, setPeriod] = useState('today');
  const [tab, setTab] = useState<'sales' | 'dayclose'>('sales');
  const [showDayCloseModal, setShowDayCloseModal] = useState(false);
  const [dayCloseData, setDayCloseData] = useState({ openingCash: '', closingCash: '', expenses: '', notes: '' });

  const { data: report, isLoading } = useQuery({
    queryKey: ['sales-report', period],
    queryFn: () => api.get(`/reports/sales?period=${period}`).then(r => r.data.data),
  });

  const { data: dayCloses } = useQuery({
    queryKey: ['day-closes'],
    queryFn: () => api.get('/reports/day-closes').then(r => r.data.data),
    enabled: tab === 'dayclose',
  });

  const dayCloseMutation = useMutation({
    mutationFn: () => api.post('/reports/day-close', {
      openingCash: parseFloat(dayCloseData.openingCash) || 0,
      closingCash: parseFloat(dayCloseData.closingCash) || 0,
      expenses:    parseFloat(dayCloseData.expenses)    || 0,
      notes:       dayCloseData.notes,
    }),
    onSuccess: () => { toast.success('Day closed successfully!'); setShowDayCloseModal(false); },
    onError:   () => toast.error('Failed to close day'),
  });

  const hourlyData = report?.hourlyBreakdown?.filter((h: { hour: number }) => h.hour >= 8 && h.hour <= 22).map((h: { hour: number; revenue: number; orderCount: number }) => ({
    time: `${String(h.hour).padStart(2, '0')}:00`,
    revenue: h.revenue,
    orders: h.orderCount,
  })) || [];

  return (
    <div className="h-full flex flex-col">
      {/* Tab bar */}
      <div className="px-5 py-3 border-b border-border/60 flex items-center gap-4">
        <div className="flex rounded-lg border border-border overflow-hidden">
          {([
            { id: 'sales',    label: 'Sales Report' },
            { id: 'dayclose', label: 'Day Close' },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'px-4 py-1.5 text-xs font-medium transition-colors',
                tab === t.id ? 'bg-orange-500 text-white' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'sales' && (
          <div className="flex gap-1.5">
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  period === p.id
                    ? 'border-orange-500/50 bg-orange-500/10 text-orange-400'
                    : 'border-border text-muted-foreground hover:bg-accent'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {tab === 'dayclose' && (
            <Button onClick={() => setShowDayCloseModal(true)}>
              <Lock className="w-4 h-4" />
              Close Day
            </Button>
          )}
        </div>
      </div>

      {/* Sales Content */}
      {tab === 'sales' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Total Revenue"   value={formatCurrency(report?.totalRevenue || 0)}   icon={<TrendingUp className="w-5 h-5" />} color="brand" />
            <StatCard label="Total Orders"    value={report?.totalOrders || 0}                      icon={<Calendar className="w-5 h-5" />}  color="blue" />
            <StatCard label="Avg Order Value" value={formatCurrency(report?.avgOrderValue || 0)}   icon={<TrendingUp className="w-5 h-5" />} color="green" />
            <StatCard label="Total Discount"  value={formatCurrency(report?.totalDiscount || 0)}   icon={<TrendingUp className="w-5 h-5" />} color="amber" />
          </div>

          <div className="grid grid-cols-3 gap-5">
            {/* Revenue by hour */}
            <Card className="col-span-2">
              <CardHeader><CardTitle>Revenue by Hour</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `Rs ${v}`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Bar dataKey="revenue" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Payment methods */}
            <Card>
              <CardHeader><CardTitle>Payment Methods</CardTitle></CardHeader>
              <CardContent>
                {(report?.revenueByPaymentMethod || []).length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={120}>
                      <PieChart>
                        <Pie data={report.revenueByPaymentMethod} cx="50%" cy="50%" outerRadius={50} dataKey="amount" paddingAngle={3}>
                          {report.revenueByPaymentMethod.map((_: unknown, i: number) => (
                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-1.5">
                      {report.revenueByPaymentMethod.map((p: { method: string; amount: number; count: number; percentage: number }, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                            <span className="text-muted-foreground">{p.method}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-medium text-foreground">{formatCurrency(p.amount)}</span>
                            <span className="text-muted-foreground ml-1">({p.count})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">No payments yet</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top items + Category breakdown */}
          <div className="grid grid-cols-2 gap-5">
            <Card>
              <CardHeader><CardTitle>Top Selling Items</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(report?.topItems || []).map((item: { inventoryItemId: string; name: string; quantity: number; revenue: number }, i: number) => (
                    <div key={item.inventoryItemId} className="flex items-center gap-3">
                      <span className="text-muted-foreground font-mono text-xs w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate">{item.name}</p>
                        <div className="w-full bg-muted rounded-full h-1 mt-1">
                          <div
                            className="bg-orange-400 h-1 rounded-full"
                            style={{ width: `${Math.min(100, (item.quantity / (report.topItems[0]?.quantity || 1)) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="font-semibold text-foreground">{formatCurrency(item.revenue)}</div>
                        <div className="text-muted-foreground">{item.quantity} sold</div>
                      </div>
                    </div>
                  ))}
                  {!report?.topItems?.length && <p className="text-sm text-muted-foreground text-center py-6">No sales data</p>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Revenue by Category</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {(report?.revenueByCategory || []).map((cat: { categoryId: string; categoryName: string; revenue: number; percentage: number }, i: number) => (
                    <div key={cat.categoryId} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-foreground">{cat.categoryName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{cat.percentage.toFixed(1)}%</span>
                          <span className="font-semibold text-foreground">{formatCurrency(cat.revenue)}</span>
                        </div>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full transition-all"
                          style={{ width: `${cat.percentage}%`, background: COLORS[i % COLORS.length] }}
                        />
                      </div>
                    </div>
                  ))}
                  {!report?.revenueByCategory?.length && <p className="text-sm text-muted-foreground text-center py-6">No data</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Day Close Content */}
      {tab === 'dayclose' && (
        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-3">
            {(dayCloses || []).map((dc: { id: string; date: string; totalSales: number; cashSales: number; cardSales: number; variance: number; closedBy?: { name: string }; totalOrders: number }) => (
              <Card key={dc.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{new Date(dc.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Closed by {dc.closedBy?.name} · {dc.totalOrders} orders</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-xl text-foreground">{formatCurrency(dc.totalSales)}</p>
                    <div className="flex items-center gap-2 mt-1 justify-end">
                      <span className="text-xs text-green-400">Cash: {formatCurrency(dc.cashSales)}</span>
                      <span className="text-xs text-blue-400">Card: {formatCurrency(dc.cardSales)}</span>
                      {dc.variance !== 0 && (
                        <Badge variant={dc.variance < 0 ? 'destructive' : 'success'} className="text-[10px]">
                          {dc.variance > 0 ? '+' : ''}{formatCurrency(dc.variance)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {(!dayCloses || dayCloses.length === 0) && (
              <div className="flex flex-col items-center py-20 text-muted-foreground">
                <Lock className="w-10 h-10 mb-3 opacity-20" />
                <p>No day close records found</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Day Close Modal */}
      {showDayCloseModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <h3 className="font-display font-semibold text-foreground">Close Day</h3>
            <p className="text-sm text-muted-foreground">Record end-of-day cash balances.</p>
            <div className="space-y-3">
              {[
                { key: 'openingCash', label: 'Opening Cash (Rs)', placeholder: '0.00' },
                { key: 'closingCash', label: 'Closing Cash (Rs)',  placeholder: '0.00' },
                { key: 'expenses',   label: 'Total Expenses (Rs)', placeholder: '0.00' },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-xs text-muted-foreground block mb-1">{f.label}</label>
                  <input
                    type="number"
                    placeholder={f.placeholder}
                    value={dayCloseData[f.key as keyof typeof dayCloseData]}
                    onChange={e => setDayCloseData(d => ({ ...d, [f.key]: e.target.value }))}
                    className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              ))}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Notes (optional)</label>
                <textarea
                  placeholder="Any notes for the close…"
                  value={dayCloseData.notes}
                  onChange={e => setDayCloseData(d => ({ ...d, notes: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring resize-none h-20"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowDayCloseModal(false)}>Cancel</Button>
              <Button className="flex-1" isLoading={dayCloseMutation.isPending} onClick={() => dayCloseMutation.mutate()}>
                {!dayCloseMutation.isPending && <Lock className="w-4 h-4" />}
                Close Day
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
