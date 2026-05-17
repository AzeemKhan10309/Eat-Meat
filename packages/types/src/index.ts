// ─── ENUMS ────────────────────────────────────────────────────────────────────

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  CASHIER = 'CASHIER',
  KITCHEN_STAFF = 'KITCHEN_STAFF',
}

export enum OrderType {
  DINE_IN = 'DINE_IN',
  TAKEAWAY = 'TAKEAWAY',
  DELIVERY = 'DELIVERY',
}

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  SERVED = 'SERVED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
  MIXED = 'MIXED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  PARTIAL = 'PARTIAL',
}

export enum TableStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  RESERVED = 'RESERVED',
  CLEANING = 'CLEANING',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE',
}

export enum KOTStatus {
  NEW = 'NEW',
  PREPARING = 'PREPARING',
  READY = 'READY',
  SERVED = 'SERVED',
  CANCELLED = 'CANCELLED',
}

export enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

export enum DiscountLevel {
  ITEM = 'ITEM',
  BILL = 'BILL',
}

export enum StockMovementType {
  PURCHASE = 'PURCHASE',
  SALE = 'SALE',
  WASTE = 'WASTE',
  ADJUSTMENT = 'ADJUSTMENT',
  ISSUE = 'ISSUE',
  RETURN = 'RETURN',
}

export enum DealType {
  BUY_ONE_GET_ONE = 'BUY_ONE_GET_ONE',
  COMBO = 'COMBO',
  BUNDLE = 'BUNDLE',
  HAPPY_HOUR = 'HAPPY_HOUR',
  PERCENTAGE_OFF = 'PERCENTAGE_OFF',
  FIXED_PRICE = 'FIXED_PRICE',
}

// ─── USER & AUTH ──────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  avatar?: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
}

// ─── MENU ─────────────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  sortOrder: number;
  isActive: boolean;
  itemCount?: number;
}

export interface MenuItemModifier {
  id: string;
  name: string;
  options: ModifierOption[];
  required: boolean;
  multiple: boolean;
}

export interface ModifierOption {
  id: string;
  name: string;
  priceAdjustment: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  costPrice: number;
  categoryId: string;
  category?: Category;
  imageUrl?: string;
  barcode?: string;
  isAvailable: boolean;
  isFeatured: boolean;
  prepTime: number; // minutes
  tax: number; // percentage
  modifiers?: MenuItemModifier[];
  allergens?: string[];
  calories?: number;
  createdAt: string;
  updatedAt: string;
}

// ─── ORDERS ───────────────────────────────────────────────────────────────────

export interface OrderItem {
  id: string;
  menuItemId: string;
  menuItem?: MenuItem;
  orderId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  discount: number;
  notes?: string;
  modifiers?: SelectedModifier[];
  status: KOTStatus;
}

export interface SelectedModifier {
  modifierId: string;
  optionId: string;
  name: string;
  priceAdjustment: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
  tableId?: string;
  table?: Table;
  customerId?: string;
  customer?: Customer;
  items: OrderItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  serviceCharge: number;
  totalAmount: number;
  paidAmount: number;
  changeAmount: number;
  paymentMethod?: PaymentMethod;
  paymentStatus: PaymentStatus;
  notes?: string;
  staffId: string;
  staff?: User;
  kotNumber?: string;
  createdAt: string;
  updatedAt: string;
  servedAt?: string;
}

export interface CreateOrderRequest {
  type: OrderType;
  tableId?: string;
  customerId?: string;
  items: CreateOrderItemRequest[];
  notes?: string;
  discountId?: string;
  discountAmount?: number;
}

export interface CreateOrderItemRequest {
  menuItemId: string;
  quantity: number;
  notes?: string;
  modifiers?: SelectedModifier[];
}

// ─── PAYMENT ──────────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  orderId: string;
  method: PaymentMethod;
  amount: number;
  cashReceived?: number;
  changeGiven?: number;
  cardLast4?: string;
  referenceNumber?: string;
  status: PaymentStatus;
  processedAt: string;
  staffId: string;
}

export interface ProcessPaymentRequest {
  orderId: string;
  method: PaymentMethod;
  amount: number;
  cashReceived?: number;
  cardLast4?: string;
  referenceNumber?: string;
  splitPayments?: SplitPayment[];
}

export interface SplitPayment {
  method: PaymentMethod;
  amount: number;
  cashReceived?: number;
}

// ─── TABLES ───────────────────────────────────────────────────────────────────

export interface Table {
  id: string;
  name: string;
  seats: number;
  status: TableStatus;
  floorId?: string;
  floor?: Floor;
  currentOrderId?: string;
  currentOrder?: Order;
  reservedFor?: string;
  reservedAt?: string;
  notes?: string;
}

export interface Floor {
  id: string;
  name: string;
  tables: Table[];
}

// ─── KITCHEN ─────────────────────────────────────────────────────────────────

export interface KOT {
  id: string;
  kotNumber: string;
  orderId: string;
  order?: Order;
  tableId?: string;
  table?: Table;
  items: KOTItem[];
  status: KOTStatus;
  priority: number;
  notes?: string;
  printedAt?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

export interface KOTItem {
  id: string;
  kotId: string;
  menuItemId: string;
  menuItem?: MenuItem;
  quantity: number;
  notes?: string;
  modifiers?: SelectedModifier[];
  status: KOTStatus;
}

// ─── INVENTORY ────────────────────────────────────────────────────────────────

export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  sku?: string;
  barcode?: string;
  categoryId?: string;
  category?: InventoryCategory;
  unit: string;
  currentStock: number;
  minStockLevel: number;
  maxStockLevel: number;
  reorderPoint: number;
  costPerUnit: number;
  supplierId?: string;
  supplier?: Supplier;
  expiryDate?: string;
  location?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryCategory {
  id: string;
  name: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  isActive: boolean;
  createdAt: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier?: Supplier;
  items: PurchaseOrderItem[];
  status: 'DRAFT' | 'SENT' | 'RECEIVED' | 'PARTIAL' | 'CANCELLED';
  totalAmount: number;
  notes?: string;
  expectedDelivery?: string;
  receivedAt?: string;
  createdBy: string;
  createdAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  inventoryItemId: string;
  inventoryItem?: InventoryItem;
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
  totalCost: number;
}

export interface StockMovement {
  id: string;
  inventoryItemId: string;
  inventoryItem?: InventoryItem;
  type: StockMovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  referenceId?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface InventoryIssue {
  id: string;
  issueNumber: string;
  items: InventoryIssueItem[];
  issuedTo: string;
  status: 'PENDING' | 'APPROVED' | 'ISSUED' | 'REJECTED';
  approvedBy?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface InventoryIssueItem {
  inventoryItemId: string;
  inventoryItem?: InventoryItem;
  quantity: number;
}

// ─── CUSTOMER ─────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  loyaltyPoints: number;
  totalOrders: number;
  totalSpent: number;
  notes?: string;
  createdAt: string;
}

// ─── DISCOUNTS & DEALS ────────────────────────────────────────────────────────

export interface Discount {
  id: string;
  name: string;
  type: DiscountType;
  level: DiscountLevel;
  value: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
  applicableItemIds?: string[];
  requiresApproval: boolean;
  isActive: boolean;
  validFrom?: string;
  validTo?: string;
}

export interface Deal {
  id: string;
  name: string;
  description?: string;
  type: DealType;
  discountValue: number;
  applicableItemIds: string[];
  bundleItems?: BundleItem[];
  isActive: boolean;
  startTime?: string;
  endTime?: string;
  daysOfWeek?: number[];
  validFrom?: string;
  validTo?: string;
}

export interface BundleItem {
  menuItemId: string;
  quantity: number;
  priceOverride?: number;
}

// ─── REPORTS ──────────────────────────────────────────────────────────────────

export interface SalesReport {
  period: string;
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  totalDiscount: number;
  totalTax: number;
  totalServiceCharge: number;
  netRevenue: number;
  revenueByCategory: CategoryRevenue[];
  revenueByPaymentMethod: PaymentMethodRevenue[];
  hourlyBreakdown: HourlyRevenue[];
  topItems: TopItem[];
}

export interface CategoryRevenue {
  categoryId: string;
  categoryName: string;
  revenue: number;
  orderCount: number;
  percentage: number;
}

export interface PaymentMethodRevenue {
  method: PaymentMethod;
  amount: number;
  count: number;
  percentage: number;
}

export interface HourlyRevenue {
  hour: number;
  revenue: number;
  orderCount: number;
}

export interface TopItem {
  menuItemId: string;
  name: string;
  quantity: number;
  revenue: number;
}

export interface DayClose {
  id: string;
  date: string;
  openingCash: number;
  closingCash: number;
  cashSales: number;
  cardSales: number;
  bankSales: number;
  totalSales: number;
  totalOrders: number;
  totalRefunds: number;
  totalDiscount: number;
  totalExpenses: number;
  variance: number;
  notes?: string;
  approvedBy?: string;
  closedBy: string;
  closedAt: string;
}

// ─── API RESPONSE ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  errors?: ValidationError[];
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ApiError {
  success: false;
  message: string;
  statusCode: number;
  errors?: ValidationError[];
}

// ─── PRINTER ──────────────────────────────────────────────────────────────────

export interface PrinterConfig {
  name: string;
  type: 'thermal' | 'regular';
  width: number; // 58 or 80mm
  interface: 'usb' | 'network' | 'bluetooth' | 'serial';
  address?: string;
  port?: number;
}

export interface ReceiptData {
  orderId: string;
  orderNumber: string;
  restaurantName: string;
  restaurantAddress: string;
  restaurantPhone: string;
  date: string;
  cashier: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  tax: number;
  serviceCharge: number;
  total: number;
  paymentMethod: string;
  cashReceived?: number;
  change?: number;
  footer?: string;
}

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  modifiers?: string[];
}

export interface KOTData {
  kotNumber: string;
  orderNumber: string;
  tableNumber?: string;
  orderType: string;
  items: KOTItem[];
  notes?: string;
  createdAt: string;
}
