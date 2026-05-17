/*
  Warnings:

  - You are about to drop the column `menuItemId` on the `kot_items` table. All the data in the column will be lost.
  - You are about to drop the column `menuItemId` on the `order_items` table. All the data in the column will be lost.
  - Added the required column `inventoryItemId` to the `kot_items` table without a default value. This is not possible if the table is not empty.
  - Added the required column `inventoryItemId` to the `order_items` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "kot_items" DROP CONSTRAINT "kot_items_menuItemId_fkey";

-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_menuItemId_fkey";

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "sellingPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "kot_items" DROP COLUMN "menuItemId",
ADD COLUMN     "inventoryItemId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "menuItemId",
ADD COLUMN     "inventoryItemId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kot_items" ADD CONSTRAINT "kot_items_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
