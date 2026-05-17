import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell
} from 'recharts';
import {
  TrendingUp, ShoppingBag, Users, Package, Clock, CheckCircle2,
  AlertTriangle, ChefHat, RefreshCw,
} from 'lucide-react';
import api from '@/services/api';
import { StatCard, Card, CardHeader, CardTitle, CardContent, Badge, Skeleton } from '@/components/ui';
import { formatCurrency, formatTimeAgo, cn } from '@/lib/utils';

const COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b'];

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-semibold text-foreground">{formatCurrency(payload[0].value)}</p>
    </div>
  );
};

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading, refetch } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => api.get('/reports/dashboard').then(r => r.data.data),
    refetchInterval: 60000,
  });

  const { data: salesReport, isLoading: salesLoading } = useQuery({
    queryKey: ['sales-report-today'],
    queryFn: () => api.get('/reports/sales?period=today').then(r => r.data.data),
    refetchInterval: 60000,
  });

  const { data: activeOrders } = useQuery({
    queryKey: ['active-orders'],
    queryFn: () => api.get('/orders/active').then(r => r.data.data),
    refetchInterval: 15000,
  });

  const hourlyData = salesReport?.hourlyBreakdown?.filter((h: { hour: number }) => h.hour >= 8 && h.hour <= 23).map((h: { hour: number; revenue: number; orderCount: number }) => ({
    time: `${String(h.hour).padStart(2, '0')}:00`,
    revenue: h.revenue,
    orders: h.orderCount,
  })) || [];

  const categoryData = salesReport?.revenueByCategory?.slice(0, 5) || [];

  const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const itemVariants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button onClick={() => refetch()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <motion.div variants={itemVariants}>
          {statsLoading ? <Skeleton className="h-24 rounded-xl" /> : (
            <StatCard
              label="Today's Revenue"
              value={formatCurrency(stats?.todayRevenue || 0)}
              sub={`${stats?.revenueChange >= 0 ? '+' : ''}${stats?.revenueChange?.toFixed(1)}% vs yesterday`}
              icon={<TrendingUp className="w-5 h-5" />}
              trend={stats?.revenueChange}
              color="brand"
            />
          )}
        </motion.div>
        <motion.div variants={itemVariants}>
          {statsLoading ? <Skeleton className="h-24 rounded-xl" /> : (
            <StatCard
              label="Today's Orders"
              value={stats?.todayOrders || 0}
              sub={`Avg: ${formatCurrency(stats?.avgOrderValue || 0)}`}
              icon={<ShoppingBag className="w-5 h-5" />}
              color="blue"
            />
          )}
        </motion.div>
        <motion.div variants={itemVariants}>
          {statsLoading ? <Skeleton className="h-24 rounded-xl" /> : (
            <StatCard
              label="Active Orders"
              value={stats?.activeOrders || 0}
              sub="In progress"
              icon={<ChefHat className="w-5 h-5" />}
              color="amber"
            />
          )}
        </motion.div>
        <motion.div variants={itemVariants}>
          {statsLoading ? <Skeleton className="h-24 rounded-xl" /> : (
            <StatCard
              label="Low Stock Items"
              value={stats?.lowStockItems || 0}
              sub="Need restocking"
              icon={<Package className="w-5 h-5" />}
              color="green"
            />
          )}
        </motion.div>
      </motion.div>

      <div className="grid grid-cols-3 gap-4">
        {/* Revenue Chart */}
        <motion.div variants={itemVariants} initial="hidden" animate="show" className="col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Today</CardTitle>
            </CardHeader>
            <CardContent>
              {salesLoading ? (
                <Skeleton className="h-48" />
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={hourlyData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="time" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `Rs ${v}`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} fill="url(#revGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Category Breakdown */}
        <motion.div variants={itemVariants} initial="hidden" animate="show">
          <Card className="h-full">
            <CardHeader>
              <CardTitle>By Category</CardTitle>
            </CardHeader>
            <CardContent>
              {salesLoading ? (
                <Skeleton className="h-48" />
              ) : categoryData.length > 0 ? (
                <div className="space-y-0">
                  <ResponsiveContainer width="100%" height={120}>
                    <PieChart>
                      <Pie data={categoryData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="revenue" paddingAngle={3}>
                        {categoryData.map((_: unknown, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-1">
                    {categoryData.slice(0, 4).map((cat: { categoryName: string; percentage: number }, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-muted-foreground flex-1 truncate">{cat.categoryName}</span>
                        <span className="font-medium text-foreground">{cat.percentage.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">No sales yet</div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Active Orders */}
        <div className="col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Live Orders</CardTitle>
              {activeOrders?.length > 0 && (
                <Badge variant="warning">{activeOrders.length} active</Badge>
              )}
            </CardHeader>
            <CardContent>
              {!activeOrders?.length ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  All orders fulfilled
                </div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {activeOrders.map((order: { id: string; orderNumber: string; status: string; type: string; table?: { name: string }; totalAmount: number; createdAt: string; items: { quantity: number; inventoryItem: { name: string } }[] }) => (
                    <div key={order.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border/40">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-mono font-medium text-foreground">{order.orderNumber}</span>
                          <Badge variant={order.status === 'READY' ? 'success' : order.status === 'PREPARING' ? 'warning' : 'info'} className="text-[10px]">
                            {order.status}
                          </Badge>
                          {order.table && <span className="text-xs text-muted-foreground">{order.table.name}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {order.items?.map((i: { quantity: number; inventoryItem: { name: string } }) => `${i.quantity}x ${i.inventoryItem?.name}`).join(', ')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-foreground">{formatCurrency(order.totalAmount)}</div>
                        <div className="text-xs text-muted-foreground">{formatTimeAgo(order.createdAt)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Stats */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    Avg Wait Time
                  </div>
                  <span className="font-semibold text-foreground">~14 min</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="w-4 h-4" />
                    Guests Today
                  </div>
                  <span className="font-semibold text-foreground">{(stats?.todayOrders || 0) * 2}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className={cn('flex items-center gap-2 text-sm', (stats?.lowStockItems || 0) > 0 ? 'text-amber-400' : 'text-muted-foreground')}>
                    {(stats?.lowStockItems || 0) > 0 ? <AlertTriangle className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                    Low Stock Items
                  </div>
                  <span className={cn('font-semibold', (stats?.lowStockItems || 0) > 0 ? 'text-amber-400' : 'text-foreground')}>
                    {stats?.lowStockItems || 0}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top Items */}
          <Card>
            <CardHeader><CardTitle>Top Items</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(salesReport?.topItems || []).slice(0, 4).map((item: { inventoryItemId: string; name: string; quantity: number; revenue: number }, i: number) => (
                  <div key={item.inventoryItemId} className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground/60 w-4 font-mono">{i + 1}</span>
                    <span className="flex-1 truncate text-foreground">{item.name}</span>
                    <span className="text-muted-foreground">{item.quantity}x</span>
                  </div>
                ))}
                {!salesReport?.topItems?.length && (
                  <p className="text-xs text-muted-foreground text-center py-3">No data yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Orders by hour bar chart */}
      <Card>
        <CardHeader><CardTitle>Orders Per Hour</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={hourlyData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip />
              <Bar dataKey="orders" fill="#f97316" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
