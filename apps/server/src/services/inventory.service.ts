import { PrismaClient, StockMovementType } from '@prisma/client';
import { AppError } from '../middleware/error.middleware';
import { generatePONumber, generateIssueNumber } from '../utils/helpers';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class InventoryService {
  async getItems(filters: {
    search?: string;
    categoryId?: string;
    lowStock?: boolean;
    supplierId?: string;
    page: number;
    limit: number;
  }) {
    const where: Record<string, unknown> = { isActive: true };
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { sku: { contains: filters.search } },
      ];
    }
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.supplierId) where.supplierId = filters.supplierId;
    const allItems = await prisma.inventoryItem.findMany({
      where,
      include: { category: true, supplier: true },
      orderBy: { name: 'asc' },
    });

    const filtered = filters.lowStock
      ? allItems.filter(i => i.currentStock <= i.reorderPoint)
      : allItems;

    const total = filtered.length;
    const data = filtered.slice(
      (filters.page - 1) * filters.limit,
      filters.page * filters.limit
    );

    return { data, total };
  }

  async getLowStockItems() {
    const items = await prisma.inventoryItem.findMany({
      where: { isActive: true },
      include: { supplier: true, category: true },
      orderBy: { currentStock: 'asc' },
    });
    return items.filter(i => i.currentStock <= i.reorderPoint);
  }

  async updateStock(
    itemId: string,
    quantity: number,
    type: StockMovementType,
    userId: string,
    referenceId?: string,
    notes?: string
  ) {
    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) throw new AppError('Inventory item not found', 404);

    const additionTypes: StockMovementType[] = [StockMovementType.PURCHASE, StockMovementType.RETURN, StockMovementType.ADJUSTMENT];
    const isAddition = additionTypes.includes(type);
    const newStock = isAddition ? item.currentStock + quantity : item.currentStock - quantity;

    if (newStock < 0) throw new AppError('Insufficient stock', 400);

    await prisma.$transaction(async tx => {
      await tx.inventoryItem.update({
        where: { id: itemId },
        data: {
          currentStock: newStock,
          ...(isAddition && { lastRestockedAt: new Date() }),
        },
      });

      await tx.stockMovement.create({
        data: {
          inventoryItemId: itemId,
          type,
          quantity,
          previousStock: item.currentStock,
          newStock,
          referenceId,
          notes,
          createdById: userId,
        },
      });
    });

    if (newStock <= item.reorderPoint) {
      logger.warn(`Low stock alert: ${item.name} (${newStock} ${item.unit})`);
    }

    return { newStock };
  }

  async createPurchaseOrder(data: {
    supplierId: string;
    items: Array<{ inventoryItemId: string; quantity: number; unitCost: number }>;
    notes?: string;
    expectedDelivery?: string;
    createdById: string;
  }) {
    const totalAmount = data.items.reduce((s, i) => s + i.quantity * i.unitCost, 0);

    return prisma.purchaseOrder.create({
      data: {
        poNumber: generatePONumber(),
        supplierId: data.supplierId,
        status: 'DRAFT',
        totalAmount,
        notes: data.notes,
        expectedDelivery: data.expectedDelivery ? new Date(data.expectedDelivery) : undefined,
        createdById: data.createdById,
        items: {
          create: data.items.map(i => ({
            inventoryItemId: i.inventoryItemId,
            quantity: i.quantity,
            receivedQuantity: 0,
            unitCost: i.unitCost,
            totalCost: i.quantity * i.unitCost,
          })),
        },
      },
      include: { items: { include: { inventoryItem: true } }, supplier: true },
    });
  }

  async receivePurchaseOrder(poId: string, receivedItems: Array<{ itemId: string; received: number }>, userId: string) {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: { include: { inventoryItem: true } } },
    });
    if (!po) throw new AppError('Purchase order not found', 404);
    if (po.status === 'CANCELLED') throw new AppError('PO is cancelled', 400);

    await prisma.$transaction(async tx => {
      let allReceived = true;

      for (const received of receivedItems) {
        const poItem = po.items.find(i => i.id === received.itemId);
        if (!poItem) continue;

        const newReceived = poItem.receivedQuantity + received.received;
        await tx.purchaseOrderItem.update({
          where: { id: received.itemId },
          data: { receivedQuantity: newReceived },
        });

        if (newReceived < poItem.quantity) allReceived = false;

        await this.updateStock(
          poItem.inventoryItemId,
          received.received,
          StockMovementType.PURCHASE,
          userId,
          poId,
          `PO: ${po.poNumber}`
        );
      }

      await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: allReceived ? 'RECEIVED' : 'PARTIAL',
          receivedAt: allReceived ? new Date() : undefined,
        },
      });
    });

    return { success: true };
  }

  async createIssue(data: {
    issuedTo: string;
    items: Array<{ inventoryItemId: string; quantity: number }>;
    notes?: string;
    createdById: string;
  }) {
    return prisma.inventoryIssue.create({
      data: {
        issueNumber: generateIssueNumber(),
        issuedTo: data.issuedTo,
        status: 'PENDING',
        issuedById: data.createdById,
        notes: data.notes,
        items: {
          create: data.items.map(i => ({
            inventoryItemId: i.inventoryItemId,
            quantity: i.quantity,
          })),
        },
      },
      include: { items: { include: { inventoryItem: true } } },
    });
  }

  async approveIssue(issueId: string, approverId: string) {
    const issue = await prisma.inventoryIssue.findUnique({
      where: { id: issueId },
      include: { items: true },
    });
    if (!issue) throw new AppError('Issue not found', 404);
    if (issue.status !== 'PENDING') throw new AppError('Issue not pending', 400);

    await prisma.$transaction(async tx => {
      for (const item of issue.items) {
        await this.updateStock(
          item.inventoryItemId,
          item.quantity,
          StockMovementType.ISSUE,
          approverId,
          issueId
        );
      }

      await tx.inventoryIssue.update({
        where: { id: issueId },
        data: { status: 'ISSUED', approvedById: approverId },
      });
    });

    return { success: true };
  }
}
