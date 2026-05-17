import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '@/stores/auth.store';
import Layout from '@/components/layout/Layout';
import LoginPage from '@/components/auth/LoginPage';
import DashboardPage  from '@/components/dashboard/DashboardPage';
import POSPage        from '@/components/pos/POSPage';
import OrdersPage     from '@/components/orders/OrdersPage';
import InventoryPage  from '@/components/inventory/InventoryPage';
import ReportsPage    from '@/components/reports/ReportsPage';
import ExpensesPage   from '@/components/expenses/ExpensesPage';
import SettingsPage   from '@/components/settings/SettingsPage';
import type { PageId } from '@/components/layout/Sidebar';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const PAGE_MAP: Record<PageId, React.ReactNode> = {
  dashboard: <DashboardPage />,
  pos:       <POSPage />,
  orders:    <OrdersPage />,
  inventory: <InventoryPage />,
  reports:   <ReportsPage />,
  expenses:  <ExpensesPage />,
  settings:  <SettingsPage />,
};

function AppContent() {
  const [activePage, setActivePage] = useState<PageId>('dashboard');
 const [authChecked, setAuthChecked] = useState(false);
  const { isAuthenticated, refreshUser, logout } = useAuthStore();

  useEffect(() => {
    const verifySession = async () => {
      const accessToken = localStorage.getItem('accessToken');
      if (!accessToken) {
        logout();
        setAuthChecked(true);
        return;
      }

      try {
        await refreshUser();
      } finally {
        setAuthChecked(true);
      }
    };

    verifySession();
  }, [refreshUser, logout]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300 text-sm">
        Verifying session...
      </div>
    );
  }

  if (!isAuthenticated) return <LoginPage />;

  return (
    <Layout activePage={activePage} onNavigate={setActivePage}>
      <AnimatePresence mode="wait">
        <motion.div
          key={activePage}
          initial={{ opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -6 }}
          transition={{ duration: 0.15, ease: 'easeInOut' }}
          className="h-full"
        >
          {PAGE_MAP[activePage]}
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'hsl(222 18% 9%)',
            color: 'hsl(210 20% 96%)',
            border: '1px solid hsl(222 16% 14%)',
            borderRadius: '10px',
            fontSize: '13px',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: 'white' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: 'white' } },
        }}
      />
    </QueryClientProvider>
  );
}
