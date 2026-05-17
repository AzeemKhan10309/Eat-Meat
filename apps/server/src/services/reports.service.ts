import { PrismaClient } from '@prisma/client';
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { ExpenseService } from './expense.service';

const prisma          = new PrismaClient();
const expenseService  = new ExpenseService();

export class ReportsService {
  async getSalesReport(period: string, dateFrom?: string, dateTo?: string) {
    let from: Date, to: Date;
    const now = new Date();

    switch (period) {
      case 'today':   from = startOfDay(now);   to = endOfDay(now);   break;
      case 'week':    from = startOfWeek(now);  to = endOfWeek(now);  break;
      case 'month':   from = startOfMonth(now); to = endOfMonth(now); break;
      case 'custom':
        from = dateFrom ? new Date(dateFrom) : startOfDay(now);
        to   = dateTo   ? new Date(dateTo)   : endOfDay(now);
        break;
      default:        from = startOfDay(now);   to = endOfDay(now);
    }

    const orders = await prisma.order.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        status: { in: ['SERVED', 'REFUNDED'] },
      },
      include: {
        items: { include: { inventoryItem: { include: { category: true } } } },
        payments: true,
      },
    });

    const totalRevenue = orders.reduce((s, o) => s + o.totalAmount, 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const totalDiscount = orders.reduce((s, o) => s + o.discountAmount, 0);
    const totalTax = orders.reduce((s, o) => s + o.taxAmount, 0);
    const totalServiceCharge = orders.reduce((s, o) => s + o.serviceCharge, 0);

    // Revenue by category
    const categoryMap = new Map<string, { name: string; revenue: number; count: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        const cat = item.inventoryItem.category?.name || 'Uncategorised';
        const catId = item.inventoryItem.categoryId || 'uncategorised';
        if (!categoryMap.has(catId)) {
          categoryMap.set(catId, { name: cat, revenue: 0, count: 0 });
        }
        const entry = categoryMap.get(catId)!;
        entry.revenue += item.totalPrice;
        entry.count += 1;
      }
    }

    const revenueByCategory = Array.from(categoryMap.entries()).map(([id, data]) => ({
      categoryId: id,
      categoryName: data.name,
      revenue: data.revenue,
      orderCount: data.count,
      percentage: totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
    }));

    // Revenue by payment method
    const paymentMap = new Map<string, { amount: number; count: number }>();
    for (const order of orders) {
      for (const payment of order.payments) {
        if (!paymentMap.has(payment.method)) {
          paymentMap.set(payment.method, { amount: 0, count: 0 });
        }
        const entry = paymentMap.get(payment.method)!;
        entry.amount += payment.amount;
        entry.count += 1;
      }
    }

    const revenueByPaymentMethod = Array.from(paymentMap.entries()).map(([method, data]) => ({
      method,
      amount: data.amount,
      count: data.count,
      percentage: totalRevenue > 0 ? (data.amount / totalRevenue) * 100 : 0,
    }));

    // Hourly breakdown
    const hourlyMap = new Map<number, { revenue: number; count: number }>();
    for (let h = 0; h < 24; h++) hourlyMap.set(h, { revenue: 0, count: 0 });
    for (const order of orders) {
      const hour = new Date(order.createdAt).getHours();
      const entry = hourlyMap.get(hour)!;
      entry.revenue += order.totalAmount;
      entry.count += 1;
    }
    const hourlyBreakdown = Array.from(hourlyMap.entries()).map(([hour, data]) => ({
      hour, revenue: data.revenue, orderCount: data.count,
    }));

    // Top items
    const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    for (const order of orders) {
      for (const item of order.items) {
        if (!itemMap.has(item.inventoryItemId)) {
          itemMap.set(item.inventoryItemId, { name: item.inventoryItem.name, quantity: 0, revenue: 0 });
        }
        const entry = itemMap.get(item.inventoryItemId)!;
        entry.quantity += item.quantity;
        entry.revenue += item.totalPrice;
      }
    }
    const topItems = Array.from(itemMap.entries())
      .map(([id, data]) => ({ inventoryItemId: id, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const totalExpenses = await expenseService.getTotalExpensesForPeriod(from, to);

    return {
      period,
      from,
      to,
      totalRevenue,
      totalOrders,
      avgOrderValue,
      totalDiscount,
      totalTax,
      totalServiceCharge,
      totalExpenses,
      netRevenue:  totalRevenue - totalDiscount,
      grossProfit: totalRevenue - totalDiscount - totalExpenses,
      revenueByCategory,
      revenueByPaymentMethod,
      hourlyBreakdown,
      topItems,
    };
  }

  async getDashboardStats() {
    const today = { gte: startOfDay(new Date()), lte: endOfDay(new Date()) };
    const yesterday = {
      gte: startOfDay(new Date(Date.now() - 86400000)),
      lte: endOfDay(new Date(Date.now() - 86400000)),
    };

    // Fetch all active items to compute low stock count via JS (Prisma can't compare two columns)
    const allActiveItems = await prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: { currentStock: true, reorderPoint: true },
    });
    const lowStockCount = allActiveItems.filter(i => i.currentStock <= i.reorderPoint).length;

    const [
      todayOrders, yesterdayOrders, activeOrders,
    ] = await Promise.all([
      prisma.order.aggregate({
        where: { createdAt: today, status: 'SERVED' },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.order.aggregate({
        where: { createdAt: yesterday, status: 'SERVED' },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.order.count({
        where: { status: { in: ['CONFIRMED', 'PREPARING', 'READY'] } },
      }),
    ]);

    const todayRevenue = todayOrders._sum.totalAmount || 0;
    const yesterdayRevenue = yesterdayOrders._sum.totalAmount || 0;
    const revenueChange = yesterdayRevenue > 0
      ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
      : 0;

    return {
      todayRevenue,
      todayOrders: todayOrders._count,
      revenueChange,
      activeOrders,
      lowStockItems: lowStockCount,
      avgOrderValue: todayOrders._count > 0 ? todayRevenue / todayOrders._count : 0,
    };
  }

  async closeDayReport(data: {
    openingCash: number;
    closingCash: number;
    expenses: number;
    notes?: string;
    staffId: string;
  }) {
    const today = { gte: startOfDay(new Date()), lte: endOfDay(new Date()) };

    const [orders, refunds] = await Promise.all([
      prisma.order.findMany({
        where: { createdAt: today, paymentStatus: 'COMPLETED' },
        include: { payments: true },
      }),
      prisma.order.findMany({
        where: { createdAt: today, paymentStatus: 'REFUNDED' },
        include: { payments: true },
      }),
    ]);

    let cashSales = 0, cardSales = 0, bankSales = 0;
    for (const order of orders) {
      for (const payment of order.payments) {
        if (payment.method === 'CASH') cashSales += payment.amount;
        else if (payment.method === 'CARD') cardSales += payment.amount;
        else if (payment.method === 'BANK_TRANSFER') bankSales += payment.amount;
      }
    }

    const totalRefunds = refunds.reduce((s, o) => s + o.totalAmount, 0);
    const totalSales = cashSales + cardSales + bankSales;
    const netRevenue = totalSales - totalRefunds - data.expenses;
    const expectedCash = data.openingCash + cashSales - totalRefunds;
    const variance = data.closingCash - expectedCash;

    return prisma.dayClose.create({
      data: {
        date: new Date(),
        openingCash: data.openingCash,
        closingCash: data.closingCash,
        cashSales,
        cardSales,
        bankSales,
        totalSales,
        totalOrders: orders.length,
        totalRefunds,
        totalDiscount: orders.reduce((s, o) => s + o.discountAmount, 0),
        totalExpenses: data.expenses,
        netRevenue,
        variance,
        notes: data.notes,
        closedById: data.staffId,
      },
    });
  }
}
