import { PrismaClient, ExpenseCategory, RecurringType } from '@prisma/client';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subMonths, format } from 'date-fns';

const prisma = new PrismaClient();

export const EXPENSE_PAYMENT_METHODS = [
  'CASH', 'CARD', 'BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA', 'CHEQUE', 'OTHER',
] as const;

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  ELECTRICITY:   'Electricity',
  RENT:          'Rent',
  STAFF_SALARY:  'Staff Salary',
  INTERNET:      'Internet',
  MAINTENANCE:   'Maintenance',
  DELIVERY:      'Delivery',
  MARKETING:     'Marketing',
  SUPPLIES:      'Supplies',
  UTILITIES:     'Utilities',
  TRANSPORT:     'Transport',
  EQUIPMENT:     'Equipment',
  MISCELLANEOUS: 'Miscellaneous',
};

interface CreateExpenseData {
  title: string;
  category: ExpenseCategory;
  description?: string;
  amount: number;
  expenseDate: string;
  paymentMethod: string;
  receiptUrl?: string;
  recurring: RecurringType;
  addedById: string;
}

interface GetExpensesOptions {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  paymentMethod?: string;
  dateFrom?: string;
  dateTo?: string;
  month?: number;
  year?: number;
}

export class ExpenseService {

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async createExpense(data: CreateExpenseData) {
    return prisma.expense.create({
      data: {
        title:         data.title,
        category:      data.category,
        description:   data.description,
        amount:        data.amount,
        expenseDate:   new Date(data.expenseDate),
        paymentMethod: data.paymentMethod,
        receiptUrl:    data.receiptUrl,
        recurring:     data.recurring,
        addedById:     data.addedById,
      },
      include: { addedBy: { select: { name: true } } },
    });
  }

  async updateExpense(id: string, data: Partial<CreateExpenseData>) {
    return prisma.expense.update({
      where: { id },
      data: {
        ...(data.title         !== undefined && { title:         data.title }),
        ...(data.category      !== undefined && { category:      data.category }),
        ...(data.description   !== undefined && { description:   data.description }),
        ...(data.amount        !== undefined && { amount:        data.amount }),
        ...(data.expenseDate   !== undefined && { expenseDate:   new Date(data.expenseDate) }),
        ...(data.paymentMethod !== undefined && { paymentMethod: data.paymentMethod }),
        ...(data.receiptUrl    !== undefined && { receiptUrl:    data.receiptUrl }),
        ...(data.recurring     !== undefined && { recurring:     data.recurring }),
      },
      include: { addedBy: { select: { name: true } } },
    });
  }

  async deleteExpense(id: string) {
    return prisma.expense.delete({ where: { id } });
  }

  async getExpenseById(id: string) {
    return prisma.expense.findUnique({
      where: { id },
      include: { addedBy: { select: { id: true, name: true } } },
    });
  }

  async getExpenses(opts: GetExpensesOptions = {}) {
    const page  = Math.max(1, opts.page  ?? 1);
    const limit = Math.min(100, opts.limit ?? 20);
    const skip  = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    // Date range — month/year shortcut OR explicit dateFrom/dateTo
    if (opts.month && opts.year) {
      const d   = new Date(opts.year, opts.month - 1, 1);
      where.expenseDate = { gte: startOfMonth(d), lte: endOfMonth(d) };
    } else if (opts.dateFrom || opts.dateTo) {
      where.expenseDate = {
        ...(opts.dateFrom && { gte: startOfDay(new Date(opts.dateFrom)) }),
        ...(opts.dateTo   && { lte: endOfDay(new Date(opts.dateTo)) }),
      };
    }

    if (opts.category)      where.category      = opts.category as ExpenseCategory;
    if (opts.paymentMethod) where.paymentMethod = opts.paymentMethod;
    if (opts.search) {
      where.OR = [
        { title:       { contains: opts.search, mode: 'insensitive' } },
        { description: { contains: opts.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.expense.findMany({
        where, skip, take: limit,
        orderBy: { expenseDate: 'desc' },
        include: { addedBy: { select: { name: true } } },
      }),
      prisma.expense.count({ where }),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  // ── Summary / Analytics ──────────────────────────────────────────────────────

  async getMonthlySummary(month: number, year: number) {
    const current = new Date(year, month - 1, 1);
    const prev    = subMonths(current, 1);

    const [currentExpenses, prevExpenses] = await Promise.all([
      prisma.expense.findMany({
        where: { expenseDate: { gte: startOfMonth(current), lte: endOfMonth(current) } },
      }),
      prisma.expense.findMany({
        where: { expenseDate: { gte: startOfMonth(prev), lte: endOfMonth(prev) } },
      }),
    ]);

    const total       = currentExpenses.reduce((s, e) => s + e.amount, 0);
    const prevTotal   = prevExpenses.reduce((s, e) => s + e.amount, 0);
    const changeVsPrev = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;

    // By category
    const byCategory = Object.values(ExpenseCategory).map(cat => {
      const items    = currentExpenses.filter(e => e.category === cat);
      const catTotal = items.reduce((s, e) => s + e.amount, 0);
      return {
        category:  cat,
        label:     EXPENSE_CATEGORY_LABELS[cat],
        total:     catTotal,
        count:     items.length,
        percentage: total > 0 ? (catTotal / total) * 100 : 0,
      };
    }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

    // By payment method
    const methodMap = new Map<string, number>();
    for (const e of currentExpenses) {
      methodMap.set(e.paymentMethod, (methodMap.get(e.paymentMethod) ?? 0) + e.amount);
    }
    const byPaymentMethod = Array.from(methodMap.entries()).map(([method, amount]) => ({
      method, amount, percentage: total > 0 ? (amount / total) * 100 : 0,
    }));

    return {
      month, year,
      total, prevTotal, changeVsPrev,
      count:         currentExpenses.length,
      byCategory,
      byPaymentMethod,
    };
  }

  async getYearlyComparison(year: number) {
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(year, i, 1);
      return { gte: startOfMonth(d), lte: endOfMonth(d), label: format(d, 'MMM') };
    });

    const results = await Promise.all(
      months.map(async ({ gte, lte, label }) => {
        const agg = await prisma.expense.aggregate({
          where: { expenseDate: { gte, lte } },
          _sum:   { amount: true },
          _count: { id: true },
        });
        return { month: label, total: agg._sum.amount ?? 0, count: agg._count.id };
      })
    );

    return results;
  }

  async getExpenseReport(dateFrom: string, dateTo: string) {
    const expenses = await prisma.expense.findMany({
      where: {
        expenseDate: {
          gte: startOfDay(new Date(dateFrom)),
          lte: endOfDay(new Date(dateTo)),
        },
      },
      include: { addedBy: { select: { name: true } } },
      orderBy: { expenseDate: 'desc' },
    });

    const total = expenses.reduce((s, e) => s + e.amount, 0);

    const byCategory = Object.values(ExpenseCategory).map(cat => {
      const items    = expenses.filter(e => e.category === cat);
      const catTotal = items.reduce((s, e) => s + e.amount, 0);
      return { category: cat, label: EXPENSE_CATEGORY_LABELS[cat], total: catTotal, count: items.length };
    }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);

    return { dateFrom, dateTo, total, count: expenses.length, byCategory, expenses };
  }

  // Used by reports service for P&L integration
  async getTotalExpensesForPeriod(from: Date, to: Date): Promise<number> {
    const agg = await prisma.expense.aggregate({
      where: { expenseDate: { gte: from, lte: to } },
      _sum: { amount: true },
    });
    return agg._sum.amount ?? 0;
  }
}
