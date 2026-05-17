import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Minus, Trash2, CreditCard, Banknote, Building2,
  ChevronRight, Tag, X, ShoppingBag, PauseCircle,
  Receipt, UtensilsCrossed, AlertCircle,
} from 'lucide-react';
import api from '@/services/api';
import { usePOSStore } from '@/stores/pos.store';
import { useAuthStore } from '@/stores/auth.store';
import { Button, Input, Separator } from '@/components/ui';
import { formatCurrency, cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { v4 as uuid } from 'uuid';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvCategory {
  id: string;
  name: string;
}

interface InvItem {
  id: string;
  name: string;
  sellingPrice: number;
  currentStock: number;
  unit: string;
  categoryId?: string;
  category?: { id: string; name: string };
  description?: string;
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function CategorySkeleton() {
  return (
    <div className="flex gap-2 px-3 py-2 border-b border-border/60 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-7 w-20 rounded-full bg-muted animate-pulse shrink-0" />
      ))}
    </div>
  );
}

function MenuGridSkeleton() {
  return (
    <div className="grid grid-cols-3 xl:grid-cols-4 gap-2.5">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/60 bg-card p-3 space-y-2 animate-pulse">
          <div className="w-8 h-8 rounded-lg bg-muted" />
          <div className="h-3 bg-muted rounded w-3/4" />
          <div className="h-3 bg-muted rounded w-1/2" />
          <div className="h-4 bg-muted rounded w-1/3 mt-2" />
        </div>
      ))}
    </div>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────────

function PaymentModal({ total, onClose, onSuccess }: { total: number; onClose: () => void; onSuccess: () => void }) {
  const [method, setMethod] = useState<'CASH' | 'CARD' | 'BANK_TRANSFER'>('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const { cart, customerId, selectedDiscountId, notes, orderType, clearCart } = usePOSStore();
  const { user } = useAuthStore();

  const change = method === 'CASH' && cashReceived ? Math.max(0, parseFloat(cashReceived) - total) : 0;

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const orderRes = await api.post('/orders', {
        type: orderType,
        customerId,
        discountId: selectedDiscountId,
        notes,
        items: cart.map(c => ({ inventoryItemId: c.inventoryItemId, quantity: c.quantity, notes: c.notes })),
        staffId: user?.id,
      });
      const orderId = orderRes.data.data.id;
      await api.post(`/orders/${orderId}/payment`, {
        method,
        amount: total,
        cashReceived: method === 'CASH' ? parseFloat(cashReceived) : undefined,
      });
      return orderRes.data.data;
    },
    onSuccess: () => {
      toast.success('Payment processed!');
      clearCart();
      onSuccess();
    },
    onError: (error: unknown) => {
      const e = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = e?.response?.data?.message || e?.message || 'Payment failed';
      toast.error(msg);
    },
  });

  const quickAmounts = [
    Math.ceil(total / 5) * 5,
    Math.ceil(total / 10) * 10,
    Math.ceil(total / 20) * 20,
    50, 100,
  ].filter((v, i, a) => a.indexOf(v) === i && v >= total).slice(0, 4);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl"
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <h2 className="font-display font-semibold text-foreground">Payment</h2>
            <p className="text-2xl font-bold text-orange-400 mt-0.5">{formatCurrency(total)}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-accent text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: 'CASH',          icon: <Banknote   className="w-4 h-4" />, label: 'Cash' },
              { id: 'CARD',          icon: <CreditCard className="w-4 h-4" />, label: 'Card' },
              { id: 'BANK_TRANSFER', icon: <Building2  className="w-4 h-4" />, label: 'Bank' },
            ] as const).map(m => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={cn(
                  'flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all',
                  method === m.id
                    ? 'border-orange-500/50 bg-orange-500/10 text-orange-400'
                    : 'border-border bg-muted text-muted-foreground hover:bg-accent'
                )}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>

          {method === 'CASH' && (
            <div className="space-y-2">
              <Input
                type="number"
                placeholder="Cash received"
                value={cashReceived}
                onChange={e => setCashReceived(e.target.value)}
                leftIcon={<span className="text-xs font-mono">Rs</span>}
              />
              <div className="flex gap-1.5 flex-wrap">
                {quickAmounts.map(amt => (
                  <button
                    key={amt}
                    onClick={() => setCashReceived(String(amt))}
                    className="px-2.5 py-1 text-xs rounded-lg bg-muted border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Rs {amt}
                  </button>
                ))}
              </div>
              {cashReceived && parseFloat(cashReceived) >= total && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-sm">
                  <span className="text-green-400">Change</span>
                  <span className="font-bold text-green-400">{formatCurrency(change)}</span>
                </div>
              )}
            </div>
          )}

          <Button
            onClick={() => createOrderMutation.mutate()}
            isLoading={createOrderMutation.isPending}
            className="w-full h-12 text-base"
            disabled={method === 'CASH' && (!cashReceived || parseFloat(cashReceived) < total)}
          >
            {!createOrderMutation.isPending && (
              <>
                <Receipt className="w-4 h-4" />
                Confirm & Print Receipt
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main POS Page ────────────────────────────────────────────────────────────

export default function POSPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);

  const {
    cart, addItem, removeItem, updateQuantity,
    clearCart, setOrderType, orderType,
    subtotal, taxAmount, total, discountAmount, itemCount,
    holdOrder, heldOrders, resumeOrder,
  } = usePOSStore();

  // ── Data fetching ──────────────────────────────────────────────────────────

  const { data: categories = [], isLoading: catsLoading } = useQuery<InvCategory[]>({
    queryKey: ['inventory-categories'],
    queryFn: () => api.get('/inventory/categories').then(r => r.data.data),
    staleTime: 0,
  });

  const { data: inventoryItems = [], isLoading: itemsLoading } = useQuery<InvItem[]>({
    queryKey: ['pos-inventory'],
    queryFn: () => api.get('/inventory/pos-items').then(r => r.data.data),
    staleTime: 0,
  });

  // ── Derived state ──────────────────────────────────────────────────────────

  const filteredItems = useMemo(() => {
    let result = inventoryItems;
    if (activeCategory) result = result.filter(i => i.categoryId === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(i =>
        i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [inventoryItems, activeCategory, search]);

  const cartInIds = new Set(cart.map(c => c.inventoryItemId));

  const handleAddToCart = (item: InvItem) => {
    if (item.sellingPrice <= 0) {
      toast.error(`Set a selling price for "${item.name}" in Inventory first`);
      return;
    }
    if (item.currentStock <= 0) {
      toast.error(`${item.name} is out of stock`);
      return;
    }
    addItem({ id: uuid(), inventoryItemId: item.id, name: item.name, price: item.sellingPrice, quantity: 1 });
  };

  return (
    <div className="flex h-full">

      {/* ── Menu Panel ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-border/60">

        {/* Search + order type */}
        <div className="p-3 border-b border-border/60 space-y-2.5">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search items…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              leftIcon={<Search className="w-3.5 h-3.5" />}
              className="flex-1"
            />
            <div className="flex rounded-lg border border-border overflow-hidden">
              {(['TAKEAWAY', 'DELIVERY'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
                  className={cn(
                    'px-2.5 py-1.5 text-xs font-medium transition-colors',
                    orderType === t
                      ? 'bg-orange-500 text-white'
                      : 'text-muted-foreground hover:text-foreground bg-transparent'
                  )}
                >
                  {t === 'TAKEAWAY' ? 'Takeaway' : 'Delivery'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Category tabs */}
        {catsLoading ? (
          <CategorySkeleton />
        ) : (
          <div className="flex gap-2 px-3 py-2 border-b border-border/60 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveCategory(null)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border shrink-0',
                !activeCategory
                  ? 'border-orange-500/50 bg-orange-500/10 text-orange-400'
                  : 'border-border text-muted-foreground hover:bg-accent'
              )}
            >
              All Items
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors border shrink-0',
                  activeCategory === c.id
                    ? 'border-orange-500/50 bg-orange-500/10 text-orange-400'
                    : 'border-border text-muted-foreground hover:bg-accent'
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Items grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {itemsLoading ? (
            <MenuGridSkeleton />
          ) : filteredItems.length > 0 ? (
            <div className="grid grid-cols-3 xl:grid-cols-4 gap-2.5">
              {filteredItems.map(item => {
                const noPrice = item.sellingPrice <= 0;
                const outOfStock = !noPrice && item.currentStock <= 0;
                const disabled = noPrice || outOfStock;
                const inCart = !disabled && cartInIds.has(item.id);
                return (
                  <motion.div
                    key={item.id}
                    whileTap={{ scale: disabled ? 1 : 0.96 }}
                    onClick={() => handleAddToCart(item)}
                    className={cn(
                      'menu-card relative',
                      inCart && 'in-cart',
                      disabled && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {noPrice && (
                      <div className="absolute top-2 right-2">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                    )}
                    {outOfStock && (
                      <div className="absolute top-2 right-2">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                      </div>
                    )}
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500/20 to-orange-600/10 flex items-center justify-center mb-2 text-sm">
                      🛒
                    </div>
                    <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2">{item.name}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                      {item.category?.name || 'Uncategorised'}
                    </p>
                    <div className="flex items-center justify-between mt-2">
                      {noPrice ? (
                        <span className="text-xs text-amber-400 font-medium">Set price first</span>
                      ) : outOfStock ? (
                        <span className="text-xs text-red-400 font-medium">Out of stock</span>
                      ) : (
                        <span className="text-sm font-bold text-orange-400">{formatCurrency(item.sellingPrice)}</span>
                      )}
                      {inCart && (
                        <div className="w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center text-[9px] font-bold text-white">
                          {cart.filter(c => c.inventoryItemId === item.id).reduce((s, c) => s + c.quantity, 0)}
                        </div>
                      )}
                    </div>
                    {!disabled && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        Stock: {item.currentStock} {item.unit}
                      </p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <UtensilsCrossed className="w-12 h-12 mb-4 opacity-20" />
              {search ? (
                <>
                  <p className="text-sm font-medium">No results for "{search}"</p>
                  <p className="text-xs mt-1">Try a different search term</p>
                </>
              ) : inventoryItems.length === 0 ? (
                <>
                  <p className="text-sm font-medium">No inventory items found</p>
                  <p className="text-xs mt-1">Add products from the Inventory section</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">No items in this category</p>
                  <p className="text-xs mt-1">Add products from Inventory</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Cart Panel ──────────────────────────────────────────────────────── */}
      <div className="w-80 flex flex-col bg-card">
        <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
          <span className="font-semibold text-sm text-foreground">Order</span>
          <div className="flex items-center gap-1">
            {heldOrders.length > 0 && (
              <div className="relative">
                <button className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                  <PauseCircle className="w-4 h-4" />
                </button>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full text-[8px] font-bold text-white flex items-center justify-center">
                  {heldOrders.length}
                </div>
              </div>
            )}
            <button
              onClick={() => holdOrder()}
              disabled={cart.length === 0}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
              title="Hold order"
            >
              <PauseCircle className="w-4 h-4" />
            </button>
            <button
              onClick={clearCart}
              disabled={cart.length === 0}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-destructive disabled:opacity-30 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5">
          <AnimatePresence>
            {cart.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-16 text-muted-foreground"
              >
                <ShoppingBag className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm">Cart is empty</p>
                <p className="text-xs mt-1">Add items from inventory</p>
              </motion.div>
            ) : (
              cart.map(item => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/50 border border-border/40"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(item.price)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="w-6 h-6 rounded-md bg-secondary hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-semibold w-5 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-6 h-6 rounded-md bg-secondary hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <span className="text-xs font-bold text-orange-400 w-14 text-right">{formatCurrency(item.totalPrice)}</span>
                  <button onClick={() => removeItem(item.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              ))
            )}
          </AnimatePresence>

          {heldOrders.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 px-0.5">On Hold</p>
              {heldOrders.map(h => (
                <button
                  key={h.id}
                  onClick={() => resumeOrder(h.id)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg border border-border/40 bg-muted/30 hover:bg-muted/60 text-left transition-colors mb-1"
                >
                  <PauseCircle className="w-3.5 h-3.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{h.label}</p>
                    <p className="text-[10px] text-muted-foreground">{h.items.length} items</p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Totals + checkout */}
        {cart.length > 0 && (
          <div className="border-t border-border/60 p-4 space-y-3">
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Subtotal ({itemCount()} items)</span>
                <span>{formatCurrency(subtotal())}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-xs text-green-400">
                  <span className="flex items-center gap-1"><Tag className="w-3 h-3" />Discount</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>VAT (10%)</span>
                <span>{formatCurrency(taxAmount())}</span>
              </div>
            </div>
            <Separator />
            <div className="flex justify-between items-center">
              <span className="font-bold text-foreground">Total</span>
              <span className="text-xl font-bold text-orange-400">{formatCurrency(total())}</span>
            </div>
            <Button onClick={() => setShowPayment(true)} className="w-full h-11">
              <CreditCard className="w-4 h-4" />
              Pay {formatCurrency(total())}
            </Button>
          </div>
        )}
      </div>

      {showPayment && (
        <PaymentModal
          total={total()}
          onClose={() => setShowPayment(false)}
          onSuccess={() => setShowPayment(false)}
        />
      )}
    </div>
  );
}
