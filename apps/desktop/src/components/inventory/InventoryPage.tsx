import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Search, Plus, AlertTriangle, Package,
  ChevronLeft, ChevronRight, BarChart2, X, FolderPlus,
} from 'lucide-react';
import api from '@/services/api';
import { Button, Input, Badge } from '@/components/ui';
import { formatCurrency, cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface InventoryItem {
  id: string; name: string; unit: string; currentStock: number;
  minStockLevel: number; reorderPoint: number; costPerUnit: number; sellingPrice: number;
  category?: { id: string; name: string }; supplier?: { name: string };
  sku?: string;
}

interface InventoryCategory { id: string; name: string; }
interface Supplier { id: string; name: string; }

const UNITS = ['kg', 'g', 'L', 'ml', 'pcs', 'box', 'bottle', 'dozen', 'pack'];

const EMPTY_FORM = {
  name: '', unit: 'pcs', categoryId: '', supplierId: '',
  currentStock: '', minStockLevel: '', reorderPoint: '',
  costPerUnit: '', sellingPrice: '', sku: '', description: '',
};

function StockBadge({ item }: { item: InventoryItem }) {
  const isCritical = item.currentStock <= item.minStockLevel;
  const isLow = item.currentStock <= item.reorderPoint;
  if (isCritical) return <Badge variant="destructive" className="text-[10px]">Critical</Badge>;
  if (isLow) return <Badge variant="warning" className="text-[10px]">Low Stock</Badge>;
  return <Badge variant="success" className="text-[10px]">In Stock</Badge>;
}

const SELECT_CLS = 'w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring';

export default function InventoryPage() {
  const queryClient = useQueryClient();

  // list state
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'low'>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  // adjust state
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState<'ADJUSTMENT' | 'WASTE'>('ADJUSTMENT');

  // add item state
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // add category state
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // inline selling price edit
  const [editPriceId, setEditPriceId] = useState<string | null>(null);
  const [editPriceVal, setEditPriceVal] = useState('');

  // ── queries ──────────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', page, search, activeTab, selectedCategoryId],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      if (activeTab === 'low') params.set('lowStock', 'true');
      if (selectedCategoryId) params.set('categoryId', selectedCategoryId);
      return api.get(`/inventory?${params}`).then(r => r.data);
    },
  });

  const { data: lowStockData } = useQuery({
    queryKey: ['low-stock'],
    queryFn: () => api.get('/inventory/low-stock').then(r => r.data.data),
  });

  const { data: invCategories = [] } = useQuery<InventoryCategory[]>({
    queryKey: ['inventory-categories'],
    queryFn: () => api.get('/inventory/categories').then(r => r.data.data),
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => api.get('/suppliers').then(r => r.data.data),
  });

  // ── mutations ────────────────────────────────────────────────────────────────

  const addCategoryMutation = useMutation({
    mutationFn: () => api.post('/inventory/categories', { name: newCatName.trim() }),
    onSuccess: (res) => {
      toast.success('Category created');
      queryClient.invalidateQueries({ queryKey: ['inventory-categories'] });
      const created = res.data?.data;
      if (created) setForm(f => ({ ...f, categoryId: created.id }));
      setShowCatModal(false);
      setNewCatName('');
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed to create category');
    },
  });

  const addMutation = useMutation({
    mutationFn: () => api.post('/inventory', {
      name: form.name,
      unit: form.unit,
      categoryId: form.categoryId || undefined,
      supplierId: form.supplierId || undefined,
      currentStock: parseFloat(form.currentStock) || 0,
      minStockLevel: parseFloat(form.minStockLevel) || 0,
      reorderPoint: parseFloat(form.reorderPoint) || 0,
      costPerUnit: parseFloat(form.costPerUnit) || 0,
      sellingPrice: parseFloat(form.sellingPrice) || 0,
      sku: form.sku || undefined,
      description: form.description || undefined,
    }),
    onSuccess: () => {
      toast.success('Item added');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['pos-inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-categories'] });
      setShowAddModal(false);
      setForm(EMPTY_FORM);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || 'Failed to add item');
    },
  });

  const updatePriceMutation = useMutation({
    mutationFn: ({ id, price }: { id: string; price: number }) =>
      api.patch(`/inventory/${id}`, { sellingPrice: price }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['pos-inventory'] });
      setEditPriceId(null);
    },
    onError: () => toast.error('Failed to update price'),
  });

  const commitPriceEdit = (id: string) => {
    const price = parseFloat(editPriceVal);
    if (isNaN(price) || price < 0) { setEditPriceId(null); return; }
    updatePriceMutation.mutate({ id, price });
  };

  const adjustMutation = useMutation({
    mutationFn: () => api.post(`/inventory/${adjustItem?.id}/adjust`, { quantity: parseFloat(adjustQty), type: adjustType }),
    onSuccess: () => {
      toast.success('Stock adjusted');
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['pos-inventory'] });
      setAdjustItem(null);
      setAdjustQty('');
    },
    onError: () => toast.error('Adjustment failed'),
  });

  const items: InventoryItem[] = data?.data || [];
  const totalPages = data?.totalPages || 1;
  const total = data?.total || 0;
  const lowCount = lowStockData?.length || 0;

  const openAddItem = () => {
    setForm({ ...EMPTY_FORM, categoryId: selectedCategoryId });
    setShowAddModal(true);
  };

  return (
    <div className="h-full flex flex-col">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-border/60 flex items-center gap-3 flex-wrap">
        {/* stock tabs */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          {([
            { id: 'all', label: 'All Items' },
            { id: 'low', label: `Low Stock${lowCount > 0 ? ` (${lowCount})` : ''}` },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setPage(1); }}
              className={cn(
                'px-3 py-1.5 text-xs font-medium transition-colors',
                activeTab === tab.id ? 'bg-orange-500 text-white' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Input
          placeholder="Search items…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          leftIcon={<Search className="w-3.5 h-3.5" />}
          className="w-52"
        />

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{total} items</span>
          <Button variant="outline" size="sm" onClick={() => setShowCatModal(true)}>
            <FolderPlus className="w-3.5 h-3.5" />
            Add Category
          </Button>
          <Button size="sm" onClick={openAddItem}>
            <Plus className="w-3.5 h-3.5" />
            Add Item
          </Button>
        </div>
      </div>

      {/* ── Category filter chips ────────────────────────────────────────────── */}
      {invCategories.length > 0 && (
        <div className="px-5 py-2 border-b border-border/40 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setSelectedCategoryId(''); setPage(1); }}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
              selectedCategoryId === ''
                ? 'bg-orange-500 text-white border-orange-500'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
            )}
          >
            All
          </button>
          {invCategories.map(cat => (
            <button
              key={cat.id}
              onClick={() => { setSelectedCategoryId(cat.id); setPage(1); }}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                selectedCategoryId === cat.id
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Low stock banner ─────────────────────────────────────────────────── */}
      {lowCount > 0 && activeTab === 'all' && (
        <div className="mx-5 mt-3 px-4 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-sm text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>{lowCount} items</strong> are low on stock and need restocking.</span>
        </div>
      )}

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border/60">
              <tr className="text-xs text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-3 text-left font-medium">Item</th>
                <th className="px-4 py-3 text-left font-medium">Category</th>
                <th className="px-4 py-3 text-left font-medium">Stock</th>
                <th className="px-4 py-3 text-left font-medium">Unit</th>
                <th className="px-4 py-3 text-left font-medium">Min / Reorder</th>
                <th className="px-4 py-3 text-left font-medium">Cost/Unit</th>
                <th className="px-4 py-3 text-left font-medium">Selling Price</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
                : items.map(item => {
                  const isLow = item.currentStock <= item.reorderPoint;
                  return (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className={cn('hover:bg-muted/30 transition-colors', isLow && 'bg-amber-500/3')}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{item.name}</div>
                        {item.sku && <div className="text-xs text-muted-foreground font-mono">{item.sku}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{item.category?.name || '—'}</td>
                      <td className="px-4 py-3">
                        <div className={cn('font-mono font-bold text-sm',
                          item.currentStock <= item.minStockLevel ? 'text-red-400'
                            : item.currentStock <= item.reorderPoint ? 'text-amber-400'
                              : 'text-foreground'
                        )}>
                          {item.currentStock}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{item.unit}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {item.minStockLevel} / {item.reorderPoint}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{formatCurrency(item.costPerUnit)}</td>
                      <td className="px-4 py-3">
                        {editPriceId === item.id ? (
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            autoFocus
                            className="w-24 bg-secondary border border-orange-500/50 rounded px-2 py-1 text-sm text-foreground outline-none"
                            value={editPriceVal}
                            onChange={e => setEditPriceVal(e.target.value)}
                            onBlur={() => commitPriceEdit(item.id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') commitPriceEdit(item.id);
                              if (e.key === 'Escape') setEditPriceId(null);
                            }}
                          />
                        ) : (
                          <button
                            onClick={() => { setEditPriceId(item.id); setEditPriceVal(String(item.sellingPrice)); }}
                            className="text-sm font-semibold text-orange-400 hover:underline"
                            title="Click to edit selling price"
                          >
                            {item.sellingPrice > 0 ? formatCurrency(item.sellingPrice) : <span className="text-amber-400 text-xs font-medium">⚠ Set price</span>}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3"><StockBadge item={item} /></td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => { setAdjustItem(item); setAdjustQty(''); }}
                          className="text-xs"
                        >
                          <BarChart2 className="w-3 h-3" />
                          Adjust
                        </Button>
                      </td>
                    </motion.tr>
                  );
                })
              }
            </tbody>
          </table>

          {items.length === 0 && !isLoading && (
            <div className="flex flex-col items-center py-16 text-muted-foreground">
              <Package className="w-10 h-10 mb-3 opacity-20" />
              <p className="mb-3">
                {selectedCategoryId
                  ? `No items in "${invCategories.find(c => c.id === selectedCategoryId)?.name}"`
                  : 'No items found'}
              </p>
              {selectedCategoryId && (
                <Button size="sm" onClick={openAddItem}>
                  <Plus className="w-3.5 h-3.5" />
                  Add first item to this category
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
        <span>Page {page} of {totalPages} · {total} total items</span>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* ── Add Category Modal ───────────────────────────────────────────────── */}
      {showCatModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-semibold text-foreground">New Category</h3>
              <button onClick={() => { setShowCatModal(false); setNewCatName(''); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <Input
              placeholder="e.g. Dairy, Meat, Beverages…"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newCatName.trim()) addCategoryMutation.mutate(); }}
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-2 mb-4">
              After creating, you can add items to this category.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowCatModal(false); setNewCatName(''); }}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                isLoading={addCategoryMutation.isPending}
                disabled={!newCatName.trim()}
                onClick={() => addCategoryMutation.mutate()}
              >
                Create Category
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Add Item Modal ───────────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h3 className="font-display font-semibold text-foreground">Add Inventory Item</h3>
                {form.categoryId && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Category: <span className="text-orange-400 font-medium">
                      {invCategories.find(c => c.id === form.categoryId)?.name}
                    </span>
                  </p>
                )}
              </div>
              <button onClick={() => { setShowAddModal(false); setForm(EMPTY_FORM); }} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-6 space-y-4">

              {/* Category row with inline "New category" shortcut */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-muted-foreground">Category</label>
                  <button
                    onClick={() => setShowCatModal(true)}
                    className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    New category
                  </button>
                </div>
                <select
                  value={form.categoryId}
                  onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}
                  className={SELECT_CLS}
                >
                  <option value="">— No category —</option>
                  {invCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* Name */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Item Name *</label>
                <Input
                  placeholder="e.g. Chicken Breast"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  autoFocus
                />
              </div>

              {/* SKU & Unit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">SKU</label>
                  <Input
                    placeholder="Optional"
                    value={form.sku}
                    onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Unit *</label>
                  <select
                    value={form.unit}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                    className={SELECT_CLS}
                  >
                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* Stock levels */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Current Stock</label>
                  <Input type="number" min="0" placeholder="0"
                    value={form.currentStock}
                    onChange={e => setForm(f => ({ ...f, currentStock: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Min Level</label>
                  <Input type="number" min="0" placeholder="0"
                    value={form.minStockLevel}
                    onChange={e => setForm(f => ({ ...f, minStockLevel: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Reorder Point</label>
                  <Input type="number" min="0" placeholder="0"
                    value={form.reorderPoint}
                    onChange={e => setForm(f => ({ ...f, reorderPoint: e.target.value }))}
                  />
                </div>
              </div>

              {/* Cost & Selling Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Cost / Unit</label>
                  <Input type="number" min="0" placeholder="0.00"
                    value={form.costPerUnit}
                    onChange={e => setForm(f => ({ ...f, costPerUnit: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">Selling Price (POS)</label>
                  <Input type="number" min="0" placeholder="0.00"
                    value={form.sellingPrice}
                    onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))}
                  />
                </div>
              </div>

              {/* Supplier */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-muted-foreground mb-1.5 block">Supplier</label>
                  <select
                    value={form.supplierId}
                    onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}
                    className={SELECT_CLS}
                  >
                    <option value="">— None —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Description</label>
                <textarea
                  rows={2}
                  placeholder="Optional notes"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowAddModal(false); setForm(EMPTY_FORM); }}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                isLoading={addMutation.isPending}
                disabled={!form.name.trim()}
                onClick={() => addMutation.mutate()}
              >
                Add Item
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── Adjust Stock Modal ───────────────────────────────────────────────── */}
      {adjustItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl"
          >
            <h3 className="font-display font-semibold text-foreground mb-1">Adjust Stock</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {adjustItem.name} — Current: <strong>{adjustItem.currentStock} {adjustItem.unit}</strong>
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block">Adjustment Type</label>
                <select
                  value={adjustType}
                  onChange={e => setAdjustType(e.target.value as 'ADJUSTMENT' | 'WASTE')}
                  className={SELECT_CLS}
                >
                  <option value="ADJUSTMENT">Stock Adjustment (Add/Remove)</option>
                  <option value="WASTE">Waste / Write-off</option>
                </select>
              </div>
              <Input
                type="number"
                placeholder={adjustType === 'WASTE' ? 'Quantity wasted' : 'Quantity (negative to remove)'}
                value={adjustQty}
                onChange={e => setAdjustQty(e.target.value)}
              />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setAdjustItem(null)}>Cancel</Button>
                <Button
                  className="flex-1"
                  isLoading={adjustMutation.isPending}
                  onClick={() => adjustMutation.mutate()}
                  disabled={!adjustQty || isNaN(parseFloat(adjustQty))}
                >
                  Confirm
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
