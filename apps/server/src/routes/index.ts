import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AuthService } from '../services/auth.service';
import { OrderService } from '../services/order.service';
import { InventoryService } from '../services/inventory.service';
import { ReportsService } from '../services/reports.service';
import { ExpenseService } from '../services/expense.service';
import { printerService } from '../services/printer.service';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.middleware';
import { sendSuccess, sendError, sendPaginated, parsePagination } from '../utils/helpers';
import { PERMISSIONS } from '@eat-and-meet/config';

const router = Router();
const prisma = new PrismaClient();
const authService = new AuthService();
const orderService = new OrderService();
const inventoryService = new InventoryService();
const reportsService  = new ReportsService();
const expenseService  = new ExpenseService();

// ─── AUTH ─────────────────────────────────────────────────────────────────────

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return sendError(res, 'Email and password required', 400);
    const result = await authService.login(email, password);
    return sendSuccess(res, result, 'Login successful');
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    return sendError(res, e.message || 'Login failed', e.statusCode || 401);
  }
});

router.post('/auth/pin-login', async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) return sendError(res, 'PIN required', 400);
    const result = await authService.loginWithPin(pin);
    return sendSuccess(res, result, 'Login successful');
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    return sendError(res, e.message || 'Invalid PIN', e.statusCode || 401);
  }
});

router.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshTokens(refreshToken);
    return sendSuccess(res, tokens);
  } catch {
    return sendError(res, 'Invalid refresh token', 401);
  }
});

router.post('/auth/logout', authenticate, async (req: AuthRequest, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) await authService.logout(refreshToken);
  return sendSuccess(res, null, 'Logged out');
});

router.get('/auth/me', authenticate, async (req: AuthRequest, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, name: true, email: true, role: true, avatar: true, phone: true, lastLogin: true },
  });
  return sendSuccess(res, user);
});

// ─── USERS ────────────────────────────────────────────────────────────────────

router.get('/users', authenticate, authorize(PERMISSIONS.STAFF_READ), async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, isActive: true, lastLogin: true, createdAt: true },
    orderBy: { name: 'asc' },
  });
  return sendSuccess(res, users);
});

router.post('/users', authenticate, authorize(PERMISSIONS.STAFF_CREATE), async (req: AuthRequest, res) => {
  try {
    const { name, email, password, role, phone } = req.body;
    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email: email.toLowerCase(), password: hashed, role, phone },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    return sendSuccess(res, user, 'User created', 201);
  } catch {
    return sendError(res, 'Failed to create user');
  }
});

router.patch('/users/:id', authenticate, authorize(PERMISSIONS.STAFF_UPDATE), async (req: AuthRequest, res) => {
  const { name, role, isActive, phone } = req.body;
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { name, role, isActive, phone },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  return sendSuccess(res, user);
});

// ─── ORDERS ───────────────────────────────────────────────────────────────────

router.get('/orders', authenticate, authorize(PERMISSIONS.ORDER_READ), async (req: AuthRequest, res) => {
  try {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { status, type, dateFrom, dateTo } = req.query;
    const { data, total } = await orderService.getOrders({
      status: status as string,
      type: type as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      page,
      limit,
    });
    return sendPaginated(res, data, total, page, limit);
  } catch {
    return sendError(res, 'Failed to fetch orders');
  }
});

router.get('/orders/active', authenticate, async (_req, res) => {
  const orders = await prisma.order.findMany({
    where: { status: { in: ['CONFIRMED', 'PREPARING', 'READY'] } },
    include: {
      items: { include: { inventoryItem: true } },
      staff: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return sendSuccess(res, orders);
});

router.get('/orders/:id', authenticate, authorize(PERMISSIONS.ORDER_READ), async (req, res) => {
  try {
    const order = await orderService.getOrderById(req.params.id);
    return sendSuccess(res, order);
  } catch {
    return sendError(res, 'Order not found', 404);
  }
});

router.post('/orders', authenticate, authorize(PERMISSIONS.ORDER_CREATE), async (req: AuthRequest, res) => {
  try {
    const order = await orderService.createOrder({ ...req.body, staffId: req.user!.id });
    return sendSuccess(res, order, 'Order created', 201);
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    return sendError(res, e.message || 'Failed to create order', e.statusCode || 400);
  }
});

router.patch('/orders/:id/status', authenticate, authorize(PERMISSIONS.ORDER_UPDATE), async (req: AuthRequest, res) => {
  try {
    const order = await orderService.updateOrderStatus(req.params.id, req.body.status, req.user!.id);
    return sendSuccess(res, order);
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    return sendError(res, e.message || 'Failed to update order', e.statusCode || 400);
  }
});

router.post('/orders/:id/payment', authenticate, async (req: AuthRequest, res) => {
  try {
    const result = await orderService.processPayment({ ...req.body, orderId: req.params.id, staffId: req.user!.id });
    return sendSuccess(res, result, 'Payment processed');
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    return sendError(res, e.message || 'Payment failed', e.statusCode || 400);
  }
});

router.post('/orders/:id/refund', authenticate, authorize(PERMISSIONS.ORDER_REFUND), async (req: AuthRequest, res) => {
  try {
    const result = await orderService.refundOrder(req.params.id, req.body.reason, req.user!.id);
    return sendSuccess(res, result, 'Refund processed');
  } catch (err: unknown) {
    const e = err as { statusCode?: number; message?: string };
    return sendError(res, e.message || 'Refund failed', e.statusCode || 400);
  }
});

// ─── INVENTORY ────────────────────────────────────────────────────────────────

router.get('/inventory/pos-items', authenticate, async (req, res) => {
  const { search, categoryId } = req.query;
  const where: Record<string, unknown> = { isActive: true };
  if (categoryId) where.categoryId = categoryId;
  if (search) where.name = { contains: search as string, mode: 'insensitive' };
  const items = await prisma.inventoryItem.findMany({
    where,
    include: { category: true },
    orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
  });
  return sendSuccess(res, items);
});

router.get('/inventory/categories', authenticate, async (_req, res) => {
  const cats = await prisma.inventoryCategory.findMany({ orderBy: { name: 'asc' } });
  return sendSuccess(res, cats);
});

router.post('/inventory/categories', authenticate, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return sendError(res, 'Category name is required', 400);
  try {
    const cat = await prisma.inventoryCategory.create({ data: { name: name.trim() } });
    return sendSuccess(res, cat, 'Category created', 201);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'P2002') return sendError(res, `Category "${name.trim()}" already exists`, 409);
    return sendError(res, 'Failed to create category', 500);
  }
});

router.get('/inventory', authenticate, async (req: AuthRequest, res) => {
  try {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { search, categoryId, lowStock, supplierId } = req.query;
    const { data, total } = await inventoryService.getItems({
      search: search as string,
      categoryId: categoryId as string,
      lowStock: lowStock === 'true',
      supplierId: supplierId as string,
      page, limit,
    });
    return sendPaginated(res, data, total, page, limit);
  } catch (err) {
    console.error('[GET /inventory]', err);
    return sendError(res, 'Failed to fetch inventory', 500);
  }
});

router.get('/inventory/low-stock', authenticate, async (_req, res) => {
  const items = await inventoryService.getLowStockItems();
  return sendSuccess(res, items);
});

router.post('/inventory', authenticate, async (req, res) => {
  const { name, unit, sku, categoryId, supplierId, sellingPrice, currentStock, minStockLevel, maxStockLevel, reorderPoint, costPerUnit, description, location } = req.body;
  if (!name?.trim()) return sendError(res, 'Item name is required', 400);
  if (!unit?.trim()) return sendError(res, 'Unit is required', 400);
  try {
    const item = await prisma.inventoryItem.create({
      data: {
        name: name.trim(),
        unit: unit.trim(),
        sku: sku?.trim() || undefined,
        categoryId: categoryId || undefined,
        supplierId: supplierId || undefined,
        sellingPrice: parseFloat(sellingPrice) || 0,
        currentStock: parseFloat(currentStock) || 0,
        minStockLevel: parseFloat(minStockLevel) || 0,
        maxStockLevel: parseFloat(maxStockLevel) || 999,
        reorderPoint: parseFloat(reorderPoint) || 0,
        costPerUnit: parseFloat(costPerUnit) || 0,
        description: description?.trim() || undefined,
        location: location?.trim() || undefined,
      },
      include: { category: true, supplier: true },
    });
    return sendSuccess(res, item, 'Item created', 201);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'P2002') return sendError(res, 'An item with this SKU already exists', 409);
    if (code === 'P2003') return sendError(res, 'Invalid category or supplier selected', 400);
    return sendError(res, 'Failed to create item', 500);
  }
});

router.patch('/inventory/:id', authenticate, async (req, res) => {
  const item = await prisma.inventoryItem.update({
    where: { id: req.params.id },
    data: req.body,
    include: { category: true, supplier: true },
  });
  return sendSuccess(res, item);
});

router.post('/inventory/:id/adjust', authenticate, authorize(PERMISSIONS.INVENTORY_UPDATE), async (req: AuthRequest, res) => {
  const { quantity, type, notes } = req.body;
  const result = await inventoryService.updateStock(req.params.id, quantity, type, req.user!.id, undefined, notes);
  return sendSuccess(res, result);
});

router.get('/inventory/movements', authenticate, authorize(PERMISSIONS.INVENTORY_READ), async (req, res) => {
  const { page, limit } = parsePagination(req.query as Record<string, unknown>);
  const { itemId } = req.query;
  const [data, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where: itemId ? { inventoryItemId: itemId as string } : {},
      include: { inventoryItem: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.stockMovement.count({ where: itemId ? { inventoryItemId: itemId as string } : {} }),
  ]);
  return sendPaginated(res, data, total, page, limit);
});

router.get('/suppliers', authenticate, async (_req, res) => {
  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  return sendSuccess(res, suppliers);
});

router.post('/suppliers', authenticate, authorize(PERMISSIONS.INVENTORY_CREATE), async (req, res) => {
  const supplier = await prisma.supplier.create({ data: req.body });
  return sendSuccess(res, supplier, 'Supplier created', 201);
});

router.get('/purchase-orders', authenticate, authorize(PERMISSIONS.INVENTORY_READ), async (req, res) => {
  const { page, limit } = parsePagination(req.query as Record<string, unknown>);
  const [data, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      include: { supplier: true, items: { include: { inventoryItem: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit, take: limit,
    }),
    prisma.purchaseOrder.count(),
  ]);
  return sendPaginated(res, data, total, page, limit);
});

router.post('/purchase-orders', authenticate, authorize(PERMISSIONS.INVENTORY_CREATE), async (req: AuthRequest, res) => {
  const po = await inventoryService.createPurchaseOrder({ ...req.body, createdById: req.user!.id });
  return sendSuccess(res, po, 'PO created', 201);
});

router.post('/purchase-orders/:id/receive', authenticate, authorize(PERMISSIONS.INVENTORY_UPDATE), async (req: AuthRequest, res) => {
  const result = await inventoryService.receivePurchaseOrder(req.params.id, req.body.items, req.user!.id);
  return sendSuccess(res, result, 'PO received');
});

router.get('/inventory-issues', authenticate, async (_req, res) => {
  const issues = await prisma.inventoryIssue.findMany({
    include: {
      items: { include: { inventoryItem: true } },
      issuedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return sendSuccess(res, issues);
});

router.post('/inventory-issues', authenticate, authorize(PERMISSIONS.INVENTORY_ISSUE), async (req: AuthRequest, res) => {
  const issue = await inventoryService.createIssue({ ...req.body, createdById: req.user!.id });
  return sendSuccess(res, issue, 'Issue created', 201);
});

router.post('/inventory-issues/:id/approve', authenticate, authorize(PERMISSIONS.INVENTORY_APPROVE), async (req: AuthRequest, res) => {
  const result = await inventoryService.approveIssue(req.params.id, req.user!.id);
  return sendSuccess(res, result);
});

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────

router.get('/customers', authenticate, async (req, res) => {
  const { search } = req.query;
  const where = search ? {
    OR: [
      { name: { contains: search as string } },
      { phone: { contains: search as string } },
      { email: { contains: search as string } },
    ],
  } : {};
  const customers = await prisma.customer.findMany({ where, orderBy: { name: 'asc' }, take: 20 });
  return sendSuccess(res, customers);
});

router.post('/customers', authenticate, async (req, res) => {
  const customer = await prisma.customer.create({ data: req.body });
  return sendSuccess(res, customer, 'Customer created', 201);
});

// ─── DISCOUNTS ────────────────────────────────────────────────────────────────

router.get('/discounts', authenticate, async (_req, res) => {
  const discounts = await prisma.discount.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  return sendSuccess(res, discounts);
});

router.post('/discounts', authenticate, authorize(PERMISSIONS.DISCOUNT_MANAGE), async (req, res) => {
  const discount = await prisma.discount.create({ data: req.body });
  return sendSuccess(res, discount, 'Discount created', 201);
});

// ─── DEALS ────────────────────────────────────────────────────────────────────

router.get('/deals', authenticate, async (_req, res) => {
  const deals = await prisma.deal.findMany({ where: { isActive: true } });
  return sendSuccess(res, deals);
});

router.post('/deals', authenticate, authorize(PERMISSIONS.DISCOUNT_MANAGE), async (req, res) => {
  const deal = await prisma.deal.create({ data: req.body });
  return sendSuccess(res, deal, 'Deal created', 201);
});

// ─── REPORTS ──────────────────────────────────────────────────────────────────

router.get('/reports/dashboard', authenticate, async (_req, res) => {
  try {
    const stats = await reportsService.getDashboardStats();
    return sendSuccess(res, stats);
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Failed to load dashboard stats', 500);
  }
});

router.get('/reports/sales', authenticate, authorize(PERMISSIONS.REPORTS_VIEW), async (req, res) => {
  try {
    const { period, dateFrom, dateTo } = req.query;
    const report = await reportsService.getSalesReport(
      (period as string) || 'today',
      dateFrom as string,
      dateTo as string
    );
    return sendSuccess(res, report);
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Failed to load sales report', 500);
  }
});

router.post('/reports/day-close', authenticate, authorize(PERMISSIONS.DAY_CLOSE), async (req: AuthRequest, res) => {
  try {
    const report = await reportsService.closeDayReport({ ...req.body, staffId: req.user!.id });
    return sendSuccess(res, report, 'Day closed');
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Failed to close day', 500);
  }
});

router.get('/reports/day-closes', authenticate, async (_req, res) => {
  try {
    const closes = await prisma.dayClose.findMany({
      include: { closedBy: { select: { name: true } } },
      orderBy: { date: 'desc' },
      take: 30,
    });
    return sendSuccess(res, closes);
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Failed to load day closes', 500);
  }
});

// ─── EXPENSES ─────────────────────────────────────────────────────────────────

router.get('/expenses', authenticate, authorize(PERMISSIONS.EXPENSE_READ), async (req, res) => {
  try {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { search, category, paymentMethod, dateFrom, dateTo, month, year } = req.query;
    const result = await expenseService.getExpenses({
      page, limit,
      search:        search        as string,
      category:      category      as string,
      paymentMethod: paymentMethod as string,
      dateFrom:      dateFrom      as string,
      dateTo:        dateTo        as string,
      month:         month         ? parseInt(month as string) : undefined,
      year:          year          ? parseInt(year  as string) : undefined,
    });
    return sendPaginated(res, result.data, result.total, result.page, result.totalPages);
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Failed to fetch expenses', 500);
  }
});

router.get('/expenses/summary', authenticate, authorize(PERMISSIONS.EXPENSE_READ), async (req, res) => {
  try {
    const now   = new Date();
    const month = req.query.month ? parseInt(req.query.month as string) : now.getMonth() + 1;
    const year  = req.query.year  ? parseInt(req.query.year  as string) : now.getFullYear();
    const summary = await expenseService.getMonthlySummary(month, year);
    return sendSuccess(res, summary);
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Failed to get summary', 500);
  }
});

router.get('/expenses/yearly', authenticate, authorize(PERMISSIONS.EXPENSE_READ), async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year as string) : new Date().getFullYear();
    const data = await expenseService.getYearlyComparison(year);
    return sendSuccess(res, data);
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Failed to get yearly data', 500);
  }
});

router.get('/expenses/report', authenticate, authorize(PERMISSIONS.EXPENSE_READ), async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    if (!dateFrom || !dateTo) return sendError(res, 'dateFrom and dateTo are required', 400);
    const report = await expenseService.getExpenseReport(dateFrom as string, dateTo as string);
    return sendSuccess(res, report);
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Failed to get report', 500);
  }
});

router.get('/expenses/:id', authenticate, authorize(PERMISSIONS.EXPENSE_READ), async (req, res) => {
  try {
    const expense = await expenseService.getExpenseById(req.params.id);
    if (!expense) return sendError(res, 'Expense not found', 404);
    return sendSuccess(res, expense);
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Failed to fetch expense', 500);
  }
});

router.post('/expenses', authenticate, authorize(PERMISSIONS.EXPENSE_CREATE), async (req: AuthRequest, res) => {
  try {
    const { title, category, description, amount, expenseDate, paymentMethod, receiptUrl, recurring } = req.body;
    if (!title)         return sendError(res, 'Title is required', 400);
    if (!category)      return sendError(res, 'Category is required', 400);
    if (!amount || amount <= 0) return sendError(res, 'Amount must be greater than 0', 400);
    if (!expenseDate)   return sendError(res, 'Expense date is required', 400);
    if (!paymentMethod) return sendError(res, 'Payment method is required', 400);

    const expense = await expenseService.createExpense({
      title, category, description, amount: parseFloat(amount),
      expenseDate, paymentMethod,
      receiptUrl, recurring: recurring || 'NONE',
      addedById: req.user!.id,
    });
    return sendSuccess(res, expense, 'Expense added', 201);
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Failed to create expense', 400);
  }
});

router.patch('/expenses/:id', authenticate, authorize(PERMISSIONS.EXPENSE_UPDATE), async (req: AuthRequest, res) => {
  try {
    const expense = await expenseService.updateExpense(req.params.id, req.body);
    return sendSuccess(res, expense);
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Failed to update expense', 400);
  }
});

router.delete('/expenses/:id', authenticate, authorize(PERMISSIONS.EXPENSE_DELETE), async (_req, res) => {
  try {
    await expenseService.deleteExpense(_req.params.id);
    return sendSuccess(res, null, 'Expense deleted');
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Failed to delete expense', 400);
  }
});

// ─── PRINTER ──────────────────────────────────────────────────────────────────

router.get('/printer/status', authenticate, async (_req, res) => {
  try {
    const status = printerService.getStatus();
    return sendSuccess(res, status);
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Failed to get printer status', 500);
  }
});

router.get('/printer/list', authenticate, async (_req, res) => {
  try {
    const printers = await printerService.listAvailablePrinters();
    return sendSuccess(res, printers);
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Failed to list printers', 500);
  }
});

router.post('/printer/detect', authenticate, async (_req, res) => {
  try {
    const status = await printerService.forceDetect();
    return sendSuccess(res, status, status.detected ? `Detected: ${status.name}` : 'No thermal printer found');
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Detection failed', 500);
  }
});

router.post('/printer/select', authenticate, async (req, res) => {
  try {
    const { printerName } = req.body as { printerName?: string };
    const status = await printerService.selectPrinter(printerName ?? '');
    return sendSuccess(res, status, printerName ? `Selected: ${printerName}` : 'Printer cleared');
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Failed to select printer', 500);
  }
});

router.post('/printer/test', authenticate, async (req, res) => {
  try {
    const result = await printerService.testPrint(req.body?.printerName);
    return sendSuccess(res, result, result.message);
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Test print failed', 500);
  }
});

router.post('/print/receipt', authenticate, async (req, res) => {
  try {
    const result = await printerService.printReceipt(req.body);
    return sendSuccess(res, result);
  } catch (err: unknown) {
    const e = err as { message?: string };
    return sendError(res, e.message || 'Print failed', 500);
  }
});

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

router.get('/settings', authenticate, async (_req, res) => {
  const settings = await prisma.restaurantSettings.findFirst();
  return sendSuccess(res, settings);
});

router.patch('/settings', authenticate, authorize(PERMISSIONS.SETTINGS_UPDATE), async (req, res) => {
  const settings = await prisma.restaurantSettings.upsert({
    where: { id: '1' },
    update: req.body,
    create: { id: '1', name: req.body.name || 'Restaurant', ...req.body },
  });
  return sendSuccess(res, settings);
});

export { router as apiRouter };
