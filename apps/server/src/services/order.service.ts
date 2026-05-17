import { PrismaClient, OrderStatus, PaymentStatus } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import { generateOrderNumber } from '../utils/helpers';
import { logger } from '../utils/logger';
import { PrinterService } from './printer.service';

const printerService = new PrinterService();

const prisma = new PrismaClient();

export class OrderService {
  async createOrder(data: {
    type: string;
    customerId?: string;
    items: Array<{ inventoryItemId: string; quantity: number; notes?: string; modifiers?: unknown[] }>;
    notes?: string;
    discountId?: string;
    staffId: string;
  }) {
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: { id: { in: data.items.map(i => i.inventoryItemId) }, isActive: true },
    });

    if (inventoryItems.length !== data.items.length) {
      throw new AppError('One or more items are unavailable or out of stock', 400);
    }

    const settings = await prisma.restaurantSettings.findFirst();
    const taxRate = settings?.taxRate || 0.1;
    const serviceChargeRate = settings?.serviceChargeRate || 0;

    let subtotal = 0;
    const orderItems = data.items.map(item => {
      const invItem = inventoryItems.find(m => m.id === item.inventoryItemId)!;
      const unitPrice = invItem.sellingPrice;
      const totalPrice = unitPrice * item.quantity;
      subtotal += totalPrice;
      return {
        inventoryItemId: item.inventoryItemId,
        quantity: item.quantity,
        unitPrice,
        totalPrice,
        notes: item.notes,
        modifiers: item.modifiers ? JSON.stringify(item.modifiers) : null,
      };
    });

    let discountAmount = 0;
    if (data.discountId) {
      const discount = await prisma.discount.findUnique({ where: { id: data.discountId } });
      if (discount?.isActive) {
        discountAmount = discount.type === 'PERCENTAGE'
          ? (subtotal * discount.value) / 100
          : discount.value;
        if (discount.maxDiscountAmount) {
          discountAmount = Math.min(discountAmount, discount.maxDiscountAmount);
        }
      }
    }

    const taxableAmount = subtotal - discountAmount;
    const taxAmount = taxableAmount * taxRate;
    const serviceCharge = taxableAmount * serviceChargeRate;
    const totalAmount = taxableAmount + taxAmount + serviceCharge;

    const order = await prisma.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        type: data.type as 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY',
        status: OrderStatus.CONFIRMED,
        customerId: data.customerId,
        discountId: data.discountId,
        subtotal,
        discountAmount,
        taxAmount,
        serviceCharge,
        totalAmount,
        paymentStatus: PaymentStatus.PENDING,
        notes: data.notes,
        staffId: data.staffId,
        items: { create: orderItems },
      },
      include: { items: { include: { inventoryItem: true } }, staff: true },
    });

    logger.info(`Order created: ${order.orderNumber}`);
    return order;
  }

  async getOrders(filters: {
    status?: string;
    type?: string;
    staffId?: string;
    dateFrom?: string;
    dateTo?: string;
    page: number;
    limit: number;
  }) {
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.type) where.type = filters.type;
    if (filters.staffId) where.staffId = filters.staffId;
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {
        ...(filters.dateFrom && { gte: new Date(filters.dateFrom) }),
        ...(filters.dateTo && { lte: new Date(filters.dateTo) }),
      };
    }

    const [data, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          items: { include: { inventoryItem: true } },
          staff: { select: { id: true, name: true } },
          customer: true,
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.order.count({ where }),
    ]);

    return { data, total };
  }

  async getOrderById(id: string) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { inventoryItem: { include: { category: true } } } },
        staff: { select: { id: true, name: true, role: true } },
        customer: true,
        payments: true,
      },
    });
    if (!order) throw new AppError('Order not found', 404);
    return order;
  }

  async updateOrderStatus(id: string, status: string, staffId: string) {
    const order = await prisma.order.findUnique({ where: { id } });
    if (!order) throw new AppError('Order not found', 404);

    const updateData: Record<string, unknown> = { status };
    if (status === OrderStatus.SERVED) updateData.servedAt = new Date();
    if (status === OrderStatus.CANCELLED) updateData.cancelledAt = new Date();

    const updated = await prisma.order.update({ where: { id }, data: updateData });
    return updated;
  }

  async processPayment(data: {
    orderId: string;
    method: string;
    amount: number;
    cashReceived?: number;
    cardLast4?: string;
    referenceNumber?: string;
    splitPayments?: Array<{ method: string; amount: number; cashReceived?: number }>;
    staffId: string;
  }) {
    const order = await prisma.order.findUnique({ where: { id: data.orderId } });
    if (!order) throw new AppError('Order not found', 404);
    if (order.paymentStatus === PaymentStatus.COMPLETED) {
      throw new AppError('Order already paid', 400);
    }

    const changeAmount = data.cashReceived ? Math.max(0, data.cashReceived - order.totalAmount) : 0;

    await prisma.$transaction(async tx => {
      if (data.splitPayments?.length) {
        for (const sp of data.splitPayments) {
          await tx.payment.create({
            data: {
              orderId: data.orderId,
              method: sp.method as 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'MIXED',
              amount: sp.amount,
              cashReceived: sp.cashReceived,
              changeGiven: sp.cashReceived ? Math.max(0, sp.cashReceived - sp.amount) : 0,
              status: PaymentStatus.COMPLETED,
              staffId: data.staffId,
            },
          });
        }
      } else {
        await tx.payment.create({
          data: {
            orderId: data.orderId,
            method: data.method as 'CASH' | 'CARD' | 'BANK_TRANSFER' | 'MIXED',
            amount: data.amount,
            cashReceived: data.cashReceived,
            changeGiven: changeAmount,
            cardLast4: data.cardLast4,
            referenceNumber: data.referenceNumber,
            status: PaymentStatus.COMPLETED,
            staffId: data.staffId,
          },
        });
      }

      await tx.order.update({
        where: { id: data.orderId },
        data: {
          paymentStatus: PaymentStatus.COMPLETED,
          status: OrderStatus.SERVED,
          paidAmount: order.totalAmount,
          changeAmount,
        },
      });

      if (order.customerId) {
        const points = Math.floor(order.totalAmount);
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            loyaltyPoints: { increment: points },
            totalOrders: { increment: 1 },
            totalSpent: { increment: order.totalAmount },
          },
        });
      }
    });

    logger.info(`Payment processed for order: ${order.orderNumber}`);

    // Auto-print receipt (fire-and-forget — never blocks payment response)
    setImmediate(async () => {
      try {
        const [fullOrder, settings] = await Promise.all([
          prisma.order.findUnique({
            where: { id: data.orderId },
            include: {
              items: { include: { inventoryItem: true } },
              payments: true,
              staff: { select: { name: true } },
            },
          }),
          prisma.restaurantSettings.findFirst(),
        ]);

        if (!fullOrder || !settings) return;

        const paymentMethod = data.splitPayments?.length
          ? data.splitPayments.map(s => s.method).join('+')
          : (data.method || 'CASH');

        await printerService.printReceipt({
          orderNumber: fullOrder.orderNumber,
          restaurantName: settings.name,
          restaurantAddress: settings.address || '',
          restaurantPhone: settings.phone || '',
          date: new Date().toLocaleString('en-GB'),
          cashier: fullOrder.staff?.name || 'Staff',
          orderType: fullOrder.type,
          items: fullOrder.items.map(i => ({
            name: i.inventoryItem.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            total: i.totalPrice,
          })),
          subtotal: fullOrder.subtotal,
          discount: fullOrder.discountAmount,
          tax: fullOrder.taxAmount,
          serviceCharge: fullOrder.serviceCharge,
          total: fullOrder.totalAmount,
          paymentMethod,
          currencySymbol: settings.currencySymbol || 'Rs',
          cashReceived: data.cashReceived,
          change: changeAmount > 0 ? changeAmount : undefined,
          footer: settings.receiptFooter || undefined,
        });
      } catch (printErr) {
        logger.error('Auto-print failed:', printErr);
      }
    });

    return { success: true, change: changeAmount };
  }

  async refundOrder(orderId: string, reason: string, staffId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });

    if (!order) throw new AppError('Order not found', 404);
    if (order.paymentStatus !== PaymentStatus.COMPLETED) {
      throw new AppError('Order not paid', 400);
    }

    await prisma.$transaction(async tx => {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.REFUNDED,
          paymentStatus: PaymentStatus.REFUNDED,
          cancellationReason: reason,
        },
      });

      for (const payment of order.payments) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.REFUNDED },
        });
      }
    });

    logger.info(`Order refunded: ${order.orderNumber}, reason: ${reason}`);
    return { success: true };
  }
}
