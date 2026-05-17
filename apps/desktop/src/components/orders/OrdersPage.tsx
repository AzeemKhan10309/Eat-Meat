import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Search, Filter, RefreshCw, Eye, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '@/services/api';
import { Button, Input, Badge } from '@/components/ui';
import { formatCurrency, formatDateTime, statusColors, cn } from '@/lib/utils';

interface Order {
  id: string; orderNumber: string; type: string; status: string; paymentStatus: string;
  totalAmount: number; createdAt: string;
  staff?: { name: string }; customer?: { name: string };
  items: { quantity: number; inventoryItem: { name: string } }[];
}

const STATUS_OPTIONS = ['', 'PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED', 'REFUNDED'];
const TYPE_OPTIONS   = ['', 'DINE_IN', 'TAKEAWAY', 'DELIVERY'];

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page, status, type],
    queryFn: () => api.get(`/orders?page=${page}&limit=20${status ? `&status=${status}` : ''}${type ? `&type=${type}` : ''}`).then(r => r.data),
  });

  const orders: Order[] = data?.data || [];
  const total     = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setSelectedOrder(null);
    },
  });

  const filteredOrders = search
    ? orders.filter(o => o.orderNumber.toLowerCase().includes(search.toLowerCase()))
    : orders;

  const sc = (status: string) => {
    const s = statusColors[status as keyof typeof statusColors];
    return s?.className || '';
  };

  return (
    <div className="h-full flex">
      {/* Order list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Filters */}
        <div className="px-5 py-3 border-b border-border/60 flex items-center gap-3 flex-wrap">
          <Input
            placeholder="Search order number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            leftIcon={<Search className="w-3.5 h-3.5" />}
            className="w-52"
          />
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <select
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1); }}
              className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:ring-2 focus:ring-ring outline-none"
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s || 'All Statuses'}</option>
              ))}
            </select>
            <select
              value={type}
              onChange={e => { setType(e.target.value); setPage(1); }}
              className="bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:ring-2 focus:ring-ring outline-none"
            >
              {TYPE_OPTIONS.map(t => (
                <option key={t} value={t}>{t.replace('_', ' ') || 'All Types'}</option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {total} orders
            <Button variant="ghost" size="icon-sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['orders'] })}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card border-b border-border/60">
              <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                <th className="px-5 py-3 text-left font-medium">Order</th>
                <th className="px-4 py-3 text-left font-medium">Type</th>
                <th className="px-4 py-3 text-left font-medium">Customer</th>
                <th className="px-4 py-3 text-left font-medium">Items</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Amount</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : filteredOrders.map(order => (
                <motion.tr
                  key={order.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => setSelectedOrder(order)}
                >
                  <td className="px-5 py-3 font-mono font-medium text-foreground">{order.orderNumber}</td>
                  <td className="px-4 py-3">
                    <Badge variant={order.type === 'DINE_IN' ? 'info' : order.type === 'TAKEAWAY' ? 'warning' : 'purple'} className="text-[10px]">
                      {order.type.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {order.customer?.name || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-40 truncate">
                    {order.items?.map(i => `${i.quantity}× ${i.inventoryItem?.name}`).join(', ')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border', sc(order.status))}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-foreground">{formatCurrency(order.totalAmount)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(order.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          {filteredOrders.length === 0 && !isLoading && (
            <div className="flex flex-col items-center py-20 text-muted-foreground">
              <p>No orders found</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
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

      {/* Order detail panel */}
      {selectedOrder && (
        <motion.div
          initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          className="w-72 border-l border-border/60 bg-card flex flex-col"
        >
          <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
            <span className="font-semibold text-sm text-foreground">{selectedOrder.orderNumber}</span>
            <button onClick={() => setSelectedOrder(null)} className="text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{selectedOrder.type}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span>
                <span className={cn('px-2 py-0.5 rounded-full border text-[10px] font-semibold', sc(selectedOrder.status))}>{selectedOrder.status}</span>
              </div>
              {selectedOrder.staff && <div className="flex justify-between"><span className="text-muted-foreground">Staff</span><span>{selectedOrder.staff.name}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Time</span><span>{formatDateTime(selectedOrder.createdAt)}</span></div>
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Items</p>
              {selectedOrder.items?.map((item, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-foreground">{item.quantity}× {item.inventoryItem?.name}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-border/40 text-sm font-bold flex justify-between">
              <span>Total</span>
              <span className="text-orange-400">{formatCurrency(selectedOrder.totalAmount)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="p-3 border-t border-border/60 space-y-2">
            {selectedOrder.status === 'CONFIRMED' && (
              <Button size="sm" className="w-full" onClick={() => updateStatus.mutate({ id: selectedOrder.id, status: 'PREPARING' })}>
                Start Preparing
              </Button>
            )}
            {selectedOrder.status === 'PREPARING' && (
              <Button size="sm" variant="success" className="w-full" onClick={() => updateStatus.mutate({ id: selectedOrder.id, status: 'READY' })}>
                Mark Ready
              </Button>
            )}
            {['CONFIRMED', 'PREPARING'].includes(selectedOrder.status) && (
              <Button size="sm" variant="destructive" className="w-full" onClick={() => updateStatus.mutate({ id: selectedOrder.id, status: 'CANCELLED' })}>
                Cancel Order
              </Button>
            )}
            {selectedOrder.paymentStatus === 'COMPLETED' && selectedOrder.status !== 'REFUNDED' && (
              <Button size="sm" variant="outline" className="w-full text-xs">
                <RotateCcw className="w-3 h-3" />
                Process Refund
              </Button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
