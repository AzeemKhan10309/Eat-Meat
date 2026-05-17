import { create } from 'zustand';

export interface CartItem {
  id: string;
  inventoryItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  modifiers?: Array<{ modifierId: string; optionId: string; name: string; priceAdjustment: number }>;
  totalPrice: number;
}

export type OrderType = 'TAKEAWAY' | 'DELIVERY';

interface POSState {
  cart: CartItem[];
  orderType: OrderType;
  customerId?: string;
  customerName?: string;
  selectedDiscountId?: string;
  discountAmount: number;
  notes: string;
  heldOrders: Array<{ id: string; items: CartItem[]; label: string; createdAt: Date }>;

  // Actions
  addItem: (item: Omit<CartItem, 'totalPrice'>) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, qty: number) => void;
  updateNotes: (id: string, notes: string) => void;
  clearCart: () => void;
  setOrderType: (type: OrderType) => void;
  setCustomer: (customerId: string, customerName: string) => void;
  setDiscount: (discountId: string | undefined, amount: number) => void;
  setNotes: (notes: string) => void;
  holdOrder: (label?: string) => void;
  resumeOrder: (id: string) => void;
  deleteHeldOrder: (id: string) => void;

  // Computed
  subtotal: () => number;
  taxAmount: () => number;
  total: () => number;
  itemCount: () => number;
}

export const usePOSStore = create<POSState>((set, get) => ({
  cart: [],
  orderType: 'TAKEAWAY',
  customerId: undefined,
  customerName: undefined,
  selectedDiscountId: undefined,
  discountAmount: 0,
  notes: '',
  heldOrders: [],

  addItem: item => {
    set(state => {
      const existing = state.cart.find(c => c.inventoryItemId === item.inventoryItemId && !c.notes && !item.notes);
      if (existing) {
        return {
          cart: state.cart.map(c =>
            c.id === existing.id
              ? { ...c, quantity: c.quantity + 1, totalPrice: (c.quantity + 1) * c.price }
              : c
          ),
        };
      }
      return {
        cart: [
          ...state.cart,
          { ...item, totalPrice: item.quantity * item.price },
        ],
      };
    });
  },

  removeItem: id => set(state => ({ cart: state.cart.filter(c => c.id !== id) })),

  updateQuantity: (id, qty) => {
    if (qty <= 0) { get().removeItem(id); return; }
    set(state => ({
      cart: state.cart.map(c => c.id === id ? { ...c, quantity: qty, totalPrice: qty * c.price } : c),
    }));
  },

  updateNotes: (id, notes) =>
    set(state => ({ cart: state.cart.map(c => c.id === id ? { ...c, notes } : c) })),

  clearCart: () => set({ cart: [], customerId: undefined, customerName: undefined, selectedDiscountId: undefined, discountAmount: 0, notes: '' }),

  setOrderType: orderType => set({ orderType }),

  setCustomer: (customerId, customerName) => set({ customerId, customerName }),

  setDiscount: (selectedDiscountId, discountAmount) => set({ selectedDiscountId, discountAmount }),

  setNotes: notes => set({ notes }),

  holdOrder: label => {
    const { cart } = get();
    if (cart.length === 0) return;
    set(state => ({
      heldOrders: [
        ...state.heldOrders,
        {
          id: crypto.randomUUID(),
          items: [...cart],
          label: label || `Hold #${state.heldOrders.length + 1}`,
          createdAt: new Date(),
        },
      ],
      cart: [],
    }));
  },

  resumeOrder: id => {
    set(state => {
      const held = state.heldOrders.find(h => h.id === id);
      if (!held) return state;
      return {
        cart: held.items,
        heldOrders: state.heldOrders.filter(h => h.id !== id),
      };
    });
  },

  deleteHeldOrder: id => set(state => ({ heldOrders: state.heldOrders.filter(h => h.id !== id) })),

  subtotal: () => get().cart.reduce((s, c) => s + c.totalPrice, 0),
  taxAmount: () => {
    const sub = get().subtotal();
    return (sub - get().discountAmount) * 0.1;
  },
  total: () => {
    const sub = get().subtotal();
    return sub - get().discountAmount + get().taxAmount();
  },
  itemCount: () => get().cart.reduce((s, c) => s + c.quantity, 0),
}));
