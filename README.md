# 🍽️ Eat & Meet — Premium Restaurant POS System

A production-grade, full-stack restaurant Point of Sale and Management System built with React, Electron, Node.js, and SQL Server.

---

## ✨ Features

| Module | Features |
|--------|----------|
| **POS** | Menu grid with categories, cart management, hold/resume orders, cash/card/bank payment, split payments, discounts |
| **Kitchen Display** | Real-time KOT kanban board, status transitions, priority alerts, Socket.IO live updates |
| **Tables** | Multi-floor table management, visual status, reservation tracking, auto-status on order creation |
| **Orders** | Full order list with filters, pagination, status management, refunds |
| **Inventory** | Stock tracking, low-stock alerts, purchase orders, stock adjustments, waste logging, issue management |
| **Reports** | Sales reports (today/week/month/custom), hourly breakdown, category analysis, top items, day close |
| **Dashboard** | Live KPIs, revenue chart, active orders feed, table occupancy, alerts |
| **Settings** | Restaurant config, staff management, printer setup, security |

---

## 🏗️ Tech Stack

### Frontend (Desktop App)
- **React 18** + **TypeScript**
- **Vite** — blazing fast build
- **Electron** — cross-platform desktop
- **Tailwind CSS** — utility-first styling
- **Framer Motion** — smooth animations
- **Zustand** — state management
- **TanStack Query** — server state + caching
- **Recharts** — data visualization
- **Socket.IO Client** — real-time updates

### Backend (API Server)
- **Node.js** + **Express** + **TypeScript**
- **Prisma ORM** — type-safe database access
- **SQL Server** — production database
- **Socket.IO** — WebSocket server
- **JWT** — authentication
- **Winston** — structured logging
- **node-thermal-printer** — receipt/KOT printing

### Packages (Shared)
- `@eat-and-meet/types` — shared TypeScript interfaces
- `@eat-and-meet/config` — shared constants & permissions

---

## 📋 Prerequisites

- **Node.js** ≥ 18.0
- **npm** ≥ 9.0
- **SQL Server** 2019+ (or Azure SQL)
- **Git**

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/your-org/eat-and-meet.git
cd eat-and-meet
npm install
```

### 2. Configure Environment

```bash
cp apps/server/.env.example apps/server/.env
```

Edit `apps/server/.env` with your SQL Server connection string:

```env
DATABASE_URL="sqlserver://localhost:1433;database=eat_and_meet;user=sa;password=YourStrong@Password;trustServerCertificate=true"
JWT_SECRET=your-super-secret-jwt-key-minimum-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-key-minimum-32-chars
```

Also create `apps/desktop/.env`:
```env
VITE_API_URL=http://localhost:3001/api
```

### 3. Setup Database

```bash
# Generate Prisma client
npm run db:generate

# Create tables
npm run db:migrate

# Seed with sample data
npm run db:seed
```

### 4. Run Development

```bash
# Start both server + desktop web app
npm run dev

# Or run individually:
npm run dev:server    # API server on :3001
npm run dev:desktop   # React app on :5173
```

### 5. Run as Desktop App

```bash
cd apps/desktop
npm run dev  # Starts Vite + Electron together
```

---

## 🔐 Default Credentials

| Role | Email | Password | PIN |
|------|-------|----------|-----|
| Super Admin | admin@eatandmeet.co.uk | Admin@123 | 1234 |
| Manager     | manager@eatandmeet.co.uk | Admin@123 | 1234 |
| Cashier     | emma@eatandmeet.co.uk | Admin@123 | 1234 |
| Kitchen     | chef@eatandmeet.co.uk | Admin@123 | 1234 |

---

## 📦 Build & Package

### Web Build

```bash
npm run build           # Build all packages
npm run build:server    # Build server only
npm run build:desktop   # Build frontend only
```

### Desktop Installer

```bash
cd apps/desktop
npm run dist:win    # Windows NSIS installer
npm run dist:mac    # macOS DMG
npm run dist:linux  # Linux AppImage
```

Installers are output to `apps/desktop/release/`.

---

## 🗂️ Project Structure

```
eat-and-meet/
├── apps/
│   ├── server/                    # Express API server
│   │   └── src/
│   │       ├── prisma/
│   │       │   ├── schema.prisma  # Database schema
│   │       │   └── seed.ts        # Sample data
│   │       ├── middleware/        # Auth, error handling
│   │       ├── services/          # Business logic
│   │       │   ├── auth.service.ts
│   │       │   ├── order.service.ts
│   │       │   ├── inventory.service.ts
│   │       │   ├── reports.service.ts
│   │       │   └── printer.service.ts
│   │       ├── routes/            # All API routes
│   │       ├── utils/             # Helpers, logger
│   │       └── index.ts           # Server entry point
│   │
│   └── desktop/                   # Electron + React app
│       ├── electron/
│       │   ├── main.js            # Electron main process
│       │   └── preload.js         # Context bridge
│       └── src/
│           ├── components/
│           │   ├── auth/          # Login page
│           │   ├── layout/        # Sidebar, TopBar
│           │   ├── dashboard/     # Dashboard page
│           │   ├── pos/           # POS + cart + payment
│           │   ├── kitchen/       # Kitchen display
│           │   ├── tables/        # Tables management
│           │   ├── orders/        # Orders list
│           │   ├── inventory/     # Inventory management
│           │   ├── reports/       # Sales reports
│           │   ├── settings/      # Settings
│           │   └── ui/            # Shared UI components
│           ├── stores/            # Zustand stores
│           │   ├── auth.store.ts
│           │   └── pos.store.ts
│           ├── services/
│           │   └── api.ts         # Axios instance
│           ├── lib/utils.ts       # Utility functions
│           ├── App.tsx            # Root component
│           └── main.tsx           # React entry point
│
└── packages/
    ├── types/src/index.ts         # Shared TypeScript types
    └── config/src/index.ts        # Shared constants
```

---

## 🔌 API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Email/password login |
| POST | `/api/auth/pin-login` | PIN login |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Logout |
| GET  | `/api/auth/me` | Get current user |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/orders` | List orders (paginated, filterable) |
| GET  | `/api/orders/active` | Get active orders |
| POST | `/api/orders` | Create order |
| PATCH | `/api/orders/:id/status` | Update order status |
| POST | `/api/orders/:id/payment` | Process payment |
| POST | `/api/orders/:id/refund` | Refund order |

### Kitchen
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/kots` | Get KOTs (filterable by status) |
| PATCH | `/api/kots/:id/status` | Update KOT status |

### Inventory
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/inventory` | List inventory items |
| GET  | `/api/inventory/low-stock` | Get low-stock items |
| POST | `/api/inventory/:id/adjust` | Adjust stock level |
| GET/POST | `/api/purchase-orders` | Manage POs |
| POST | `/api/purchase-orders/:id/receive` | Receive PO |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/reports/dashboard` | Dashboard stats |
| GET  | `/api/reports/sales?period=today` | Sales report |
| POST | `/api/reports/day-close` | Close the day |

---

## 🔧 Configuration

### Printer Setup

Edit `apps/server/.env`:

```env
PRINTER_NAME=your-printer-name    # Windows: "POS-80", Linux: "/dev/usb/lp0"
PRINTER_TYPE=thermal              # thermal | regular
PRINTER_WIDTH=80                  # 58 | 80 (mm)
```

### Tax & Currency

Defaults are set in `packages/config/src/index.ts`:

```typescript
export const DEFAULT_TAX_RATE = 0.1;        // 10%
export const DEFAULT_SERVICE_CHARGE = 0.0; // 0%
export const CURRENCY_SYMBOL = '£';
export const CURRENCY_CODE = 'GBP';
```

These can also be configured per-restaurant in Settings.

---

## 🌐 WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `order:created` | Server → Client | New order placed |
| `order:updated` | Server → Client | Order status changed |
| `kot:created` | Server → Client | New KOT |
| `kot:status_changed` | Server → Client | KOT status updated |
| `table:status_changed` | Server → Client | Table occupancy changed |
| `inventory:low_stock` | Server → Client | Low stock alert |

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🆘 Support

- **Docs**: Check this README and inline code comments
- **Issues**: Open a GitHub issue
- **Email**: dev@eatandmeet.co.uk
