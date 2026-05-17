"use strict";
// ─── APP CONFIG ───────────────────────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_PERMISSIONS = exports.PERMISSIONS = exports.WS_EVENTS = exports.CACHE_TTL = exports.CURRENCY_CODE = exports.CURRENCY_SYMBOL = exports.DEFAULT_SERVICE_CHARGE = exports.DEFAULT_TAX_RATE = exports.KOT_MAX_CHARS = exports.RECEIPT_MAX_CHARS = exports.THERMAL_PRINTER_WIDTH = exports.MAX_PAGE_SIZE = exports.DEFAULT_PAGE_SIZE = exports.LOCKOUT_DURATION = exports.MAX_LOGIN_ATTEMPTS = exports.BCRYPT_ROUNDS = exports.JWT_REFRESH_EXPIRY = exports.JWT_ACCESS_EXPIRY = exports.API_VERSION = exports.API_TIMEOUT = exports.API_BASE_URL = exports.APP_DESCRIPTION = exports.APP_VERSION = exports.APP_NAME = void 0;
exports.APP_NAME = 'Eat & Meet';
exports.APP_VERSION = '1.0.0';
exports.APP_DESCRIPTION = 'Premium Restaurant Management & POS System';
// ─── API CONFIG ───────────────────────────────────────────────────────────────
exports.API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:3001/api';
exports.API_TIMEOUT = 30000;
exports.API_VERSION = 'v1';
// ─── AUTH CONFIG ──────────────────────────────────────────────────────────────
exports.JWT_ACCESS_EXPIRY = '15m';
exports.JWT_REFRESH_EXPIRY = '7d';
exports.BCRYPT_ROUNDS = 12;
exports.MAX_LOGIN_ATTEMPTS = 5;
exports.LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes
// ─── PAGINATION ───────────────────────────────────────────────────────────────
exports.DEFAULT_PAGE_SIZE = 20;
exports.MAX_PAGE_SIZE = 100;
// ─── PRINTER CONFIG ───────────────────────────────────────────────────────────
exports.THERMAL_PRINTER_WIDTH = 80; // mm
exports.RECEIPT_MAX_CHARS = 48; // 80mm at 12cpi
exports.KOT_MAX_CHARS = 48;
// ─── TAX & CHARGES ────────────────────────────────────────────────────────────
exports.DEFAULT_TAX_RATE = 0.1; // 10%
exports.DEFAULT_SERVICE_CHARGE = 0.0; // 0% — configurable
exports.CURRENCY_SYMBOL = '£';
exports.CURRENCY_CODE = 'GBP';
// ─── CACHE ────────────────────────────────────────────────────────────────────
exports.CACHE_TTL = {
    MENU: 5 * 60 * 1000, // 5 minutes
    CATEGORIES: 10 * 60 * 1000, // 10 minutes
    TABLES: 30 * 1000, // 30 seconds
    ORDERS: 15 * 1000, // 15 seconds
    REPORTS: 60 * 1000, // 1 minute
    USER: 30 * 60 * 1000, // 30 minutes
};
// ─── WEBSOCKET ────────────────────────────────────────────────────────────────
exports.WS_EVENTS = {
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
exports.PERMISSIONS = {
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
    EXPENSE_READ: 'expense:read',
    EXPENSE_CREATE: 'expense:create',
    EXPENSE_UPDATE: 'expense:update',
    EXPENSE_DELETE: 'expense:delete',
    // Settings
    SETTINGS_READ: 'settings:read',
    SETTINGS_UPDATE: 'settings:update',
};
exports.ROLE_PERMISSIONS = {
    SUPER_ADMIN: Object.values(exports.PERMISSIONS),
    ADMIN: Object.values(exports.PERMISSIONS),
    MANAGER: [
        exports.PERMISSIONS.ORDER_CREATE, exports.PERMISSIONS.ORDER_READ,
        exports.PERMISSIONS.ORDER_UPDATE, exports.PERMISSIONS.ORDER_CANCEL, exports.PERMISSIONS.ORDER_REFUND,
        exports.PERMISSIONS.MENU_READ, exports.PERMISSIONS.MENU_CREATE, exports.PERMISSIONS.MENU_UPDATE,
        exports.PERMISSIONS.INVENTORY_READ, exports.PERMISSIONS.INVENTORY_CREATE, exports.PERMISSIONS.INVENTORY_UPDATE,
        exports.PERMISSIONS.INVENTORY_ISSUE, exports.PERMISSIONS.INVENTORY_APPROVE,
        exports.PERMISSIONS.REPORTS_VIEW, exports.PERMISSIONS.REPORTS_EXPORT,
        exports.PERMISSIONS.STAFF_READ,
        exports.PERMISSIONS.DISCOUNT_APPLY, exports.PERMISSIONS.DISCOUNT_MANAGE, exports.PERMISSIONS.DISCOUNT_APPROVE,
        exports.PERMISSIONS.DAY_CLOSE, exports.PERMISSIONS.DAY_CLOSE_APPROVE,
        exports.PERMISSIONS.EXPENSE_READ, exports.PERMISSIONS.EXPENSE_CREATE, exports.PERMISSIONS.EXPENSE_UPDATE, exports.PERMISSIONS.EXPENSE_DELETE,
        exports.PERMISSIONS.SETTINGS_READ,
    ],
    CASHIER: [
        exports.PERMISSIONS.ORDER_CREATE, exports.PERMISSIONS.ORDER_READ, exports.PERMISSIONS.ORDER_UPDATE,
        exports.PERMISSIONS.MENU_READ,
        exports.PERMISSIONS.DISCOUNT_APPLY,
        exports.PERMISSIONS.REPORTS_VIEW,
        exports.PERMISSIONS.EXPENSE_READ, exports.PERMISSIONS.EXPENSE_CREATE,
    ],
    KITCHEN_STAFF: [
        exports.PERMISSIONS.ORDER_READ,
        exports.PERMISSIONS.MENU_READ,
    ],
};
//# sourceMappingURL=index.js.map