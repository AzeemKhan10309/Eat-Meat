import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Restaurant Settings ──────────────────────────────────────────────────
  await prisma.restaurantSettings.upsert({
    where: { id: '1' },
    update: {},
    create: {
      id: '1',
      name: 'Eat & Meet Restaurant',
      address: '12 Baker Street, London W1U 3BG',
      phone: '+44 20 7946 0000',
      email: 'hello@eatandmeet.co.uk',
      taxId: 'GB 123 456 789',
      currencySymbol: 'Rs',
      currencyCode: 'PKR',
      taxRate: 0.1,
      serviceChargeRate: 0.0,
      receiptFooter: 'Thank you for dining with us!\nwww.eatandmeet.co.uk',
      timezone: 'Europe/London',
    },
  });

  // ── Users ─────────────────────────────────────────────────────────────────
  const hashedPassword = await bcrypt.hash('Admin@123', 12);
  const hashedPin = await bcrypt.hash('1234', 12);

  const users = [
    { name: 'Super Admin',    email: 'admin@eatandmeet.co.uk',    role: UserRole.SUPER_ADMIN },
    { name: 'James Davis',    email: 'manager@eatandmeet.co.uk',  role: UserRole.MANAGER },
    { name: 'Emma Wilson',    email: 'emma@eatandmeet.co.uk',     role: UserRole.CASHIER },
    { name: 'Jake Miller',    email: 'jake@eatandmeet.co.uk',     role: UserRole.CASHIER },
    { name: 'Chef Antonio',   email: 'chef@eatandmeet.co.uk',     role: UserRole.KITCHEN_STAFF },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, password: hashedPassword, pin: hashedPin },
    });
  }

  // ── Suppliers ─────────────────────────────────────────────────────────────
  const suppliers = [
    { name: 'Premium Meats Co.',   contactPerson: 'John Smith',   email: 'orders@premiummeats.co.uk',  phone: '+44 20 1234 5678' },
    { name: 'Fresh Dairy Co.',     contactPerson: 'Mary Jones',   email: 'supply@freshdairy.co.uk',    phone: '+44 20 2345 6789' },
    { name: 'Gourmet Supplies',    contactPerson: 'Paul Brown',   email: 'info@gourmetsupplies.co.uk', phone: '+44 20 3456 7890' },
    { name: 'Artisan Bakery Ltd',  contactPerson: 'Sarah Davis',  email: 'orders@artisanbakery.co.uk', phone: '+44 20 4567 8901' },
    { name: 'Italian Imports',     contactPerson: 'Marco Rossi',  email: 'uk@italianImports.co.uk',    phone: '+44 20 5678 9012' },
    { name: 'Brew Masters',        contactPerson: 'Tom Hughes',   email: 'sales@brewmasters.co.uk',    phone: '+44 20 6789 0123' },
    { name: 'Coffee Roasters UK',  contactPerson: 'Lisa Chen',    email: 'supply@coffeeroasters.co.uk',phone: '+44 20 7890 1234' },
  ];

  for (const s of suppliers) {
    await prisma.supplier.create({ data: s });
  }

  // ── Discounts ─────────────────────────────────────────────────────────────
  await prisma.discount.createMany({
    data: [
      { name: 'Happy Hour 10%',   type: 'PERCENTAGE', level: 'BILL', value: 10, isActive: true },
      { name: 'Staff Discount',   type: 'PERCENTAGE', level: 'BILL', value: 15, requiresApproval: true, isActive: true },
      { name: 'Senior Discount',  type: 'PERCENTAGE', level: 'BILL', value: 5,  isActive: true },
      { name: 'Manager Override', type: 'PERCENTAGE', level: 'BILL', value: 20, requiresApproval: true, isActive: true },
      { name: 'Rs 5 Off',           type: 'FIXED',      level: 'BILL', value: 5,  minOrderAmount: 30, isActive: true },
    ],
  });

  console.log('✅ Database seeded successfully!');
  console.log('\n📋 Default login credentials:');
  console.log('   Email: admin@eatandmeet.co.uk');
  console.log('   Password: Admin@123');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
