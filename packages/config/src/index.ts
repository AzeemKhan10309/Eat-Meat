// ─── APP CONFIG ───────────────────────────────────────────────────────────────

export const APP_NAME = 'Eat & Meet';
export const APP_VERSION = '1.0.0';
export const APP_DESCRIPTION = 'Premium Restaurant Management & POS System';

// ─── API CONFIG ───────────────────────────────────────────────────────────────

export const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3001/api';
export const API_TIMEOUT = 30000;
export const API_VERSION = 'v1';

// ─── AUTH CONFIG ──────────────────────────────────────────────────────────────

export const JWT_ACCESS_EXPIRY = '15m';
export const JWT_REFRESH_EXPIRY = '7d';
export const BCRYPT_ROUNDS = 12;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

// ─── PAGINATION ───────────────────────────────────────────────────────────────

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// ─── PRINTER CONFIG ───────────────────────────────────────────────────────────

export const THERMAL_PRINTER_WIDTH = 80; // mm
export const RECEIPT_MAX_CHARS = 48; // 80mm at 12cpi
export const KOT_MAX_CHARS = 48;

// ─── TAX & CHARGES ────────────────────────────────────────────────────────────

export const DEFAULT_TAX_RATE = 0.1; // 10%
export const DEFAULT_SERVICE_CHARGE = 0.0; // 0% — configurable
export const CURRENCY_SYMBOL = '£';
export const CURRENCY_CODE = 'GBP';

// ─── CACHE ────────────────────────────────────────────────────────────────────

export const CACHE_TTL = {
  MENU: 5 * 60 * 1000,       // 5 minutes
  CATEGORIES: 10 * 60 * 1000, // 10 minutes
  TABLES: 30 * 1000,          // 30 seconds
  ORDERS: 15 * 1000,          // 15 seconds
  REPORTS: 60 * 1000,         // 1 minute
  USER: 30 * 60 * 1000,       // 30 minutes
};

// ─── WEBSOCKET ────────────────────────────────────────────────────────────────

export const WS_EVENTS = {
  ORDER_CREATED: 'order:created',
  ORDER_UPDATED: 'order:updated',
  ORDER_STATUS_CHANGED: 'order:status_changed',
  KOT_CREATED: 'kot:created',
  KOT_STATUS_CHANGED: 'kot:status_changed',
  TABLE_STATUS_CHANGED: 'table:status_changed',
  INVENTORY_LOW_STOCK: 'inventory:low_stock',
  DAY_CLOSED: 'day:closed',
};

// ─── PERMISSIONS ──────────────────────────────────────────────────────────────

export const PERMISSIONS = {
  // Orders
  ORDER_CREATE: 'order:create',
  ORDER_READ: 'order:read',
  ORDER_UPDATE: 'order:update',
  ORDER_CANCEL: 'order:cancel',
  ORDER_REFUND: 'order:refund',

  // Menu
  MENU_READ: 'menu:read',
  MENU_CREATE: 'menu:create',
  MENU_UPDATE: 'menu:update',
  MENU_DELETE: 'menu:delete',

  // Inventory
  INVENTORY_READ: 'inventory:read',
  INVENTORY_CREATE: 'inventory:create',
  INVENTORY_UPDATE: 'inventory:update',
  INVENTORY_ISSUE: 'inventory:issue',
  INVENTORY_APPROVE: 'inventory:approve',

  // Reports
  REPORTS_VIEW: 'reports:view',
  REPORTS_EXPORT: 'reports:export',

  // Staff
  STAFF_READ: 'staff:read',
  STAFF_CREATE: 'staff:create',
  STAFF_UPDATE: 'staff:update',
  STAFF_DELETE: 'staff:delete',

  // Discounts
  DISCOUNT_APPLY: 'discount:apply',
  DISCOUNT_MANAGE: 'discount:manage',
  DISCOUNT_APPROVE: 'discount:approve',

  // Day Close
  DAY_CLOSE: 'day:close',
  DAY_CLOSE_APPROVE: 'day:close_approve',

  // Expenses
  EXPENSE_READ:   'expense:read',
  EXPENSE_CREATE: 'expense:create',
  EXPENSE_UPDATE: 'expense:update',
  EXPENSE_DELETE: 'expense:delete',

  // Settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_UPDATE: 'settings:update',
};

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: Object.values(PERMISSIONS),
  ADMIN: Object.values(PERMISSIONS),
  MANAGER: [
    PERMISSIONS.ORDER_CREATE, PERMISSIONS.ORDER_READ,
    PERMISSIONS.ORDER_UPDATE, PERMISSIONS.ORDER_CANCEL, PERMISSIONS.ORDER_REFUND,
    PERMISSIONS.MENU_READ, PERMISSIONS.MENU_CREATE, PERMISSIONS.MENU_UPDATE,
    PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_CREATE, PERMISSIONS.INVENTORY_UPDATE,
    PERMISSIONS.INVENTORY_ISSUE, PERMISSIONS.INVENTORY_APPROVE,
    PERMISSIONS.REPORTS_VIEW, PERMISSIONS.REPORTS_EXPORT,
    PERMISSIONS.STAFF_READ,
    PERMISSIONS.DISCOUNT_APPLY, PERMISSIONS.DISCOUNT_MANAGE, PERMISSIONS.DISCOUNT_APPROVE,
    PERMISSIONS.DAY_CLOSE, PERMISSIONS.DAY_CLOSE_APPROVE,
    PERMISSIONS.EXPENSE_READ, PERMISSIONS.EXPENSE_CREATE, PERMISSIONS.EXPENSE_UPDATE, PERMISSIONS.EXPENSE_DELETE,
    PERMISSIONS.SETTINGS_READ,
  ],
  CASHIER: [
    PERMISSIONS.ORDER_CREATE, PERMISSIONS.ORDER_READ, PERMISSIONS.ORDER_UPDATE,
    PERMISSIONS.MENU_READ,
    PERMISSIONS.DISCOUNT_APPLY,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.EXPENSE_READ, PERMISSIONS.EXPENSE_CREATE,
  ],
  KITCHEN_STAFF: [
    PERMISSIONS.ORDER_READ,
    PERMISSIONS.MENU_READ,
  ],
};
