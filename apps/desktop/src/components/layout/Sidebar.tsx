import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, ShoppingCart, ClipboardList,
  Package, BarChart3, Settings, UtensilsCrossed,
  ChevronLeft, ChevronRight, LogOut, Bell, Receipt,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui';
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

export type PageId =
  | 'dashboard' | 'pos' | 'orders'
  | 'inventory' | 'reports' | 'expenses' | 'settings';

interface NavItem {
  id: PageId;
  icon: React.ReactNode;
  label: string;
  badge?: string | number;
}

interface SidebarProps {
  active: PageId;
  onChange: (page: PageId) => void;
  collapsed: boolean;
  onToggle: () => void;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', icon: <LayoutDashboard className="w-4.5 h-4.5" />, label: 'Dashboard' },
  { id: 'pos',       icon: <ShoppingCart className="w-4.5 h-4.5" />,    label: 'Point of Sale' },
  { id: 'orders',    icon: <ClipboardList className="w-4.5 h-4.5" />,   label: 'Orders' },
  { id: 'inventory', icon: <Package className="w-4.5 h-4.5" />,         label: 'Inventory' },
  { id: 'reports',   icon: <BarChart3 className="w-4.5 h-4.5" />,       label: 'Reports' },
  { id: 'expenses',  icon: <Receipt className="w-4.5 h-4.5" />,         label: 'Expenses' },
  { id: 'settings',  icon: <Settings className="w-4.5 h-4.5" />,        label: 'Settings' },
];

export default function Sidebar({ active, onChange, collapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuthStore();

  const { data: activeOrderCount } = useQuery({
    queryKey: ['active-orders-count'],
    queryFn: async () => {
      const { data } = await api.get('/orders/active');
      return data.data?.length || 0;
    },
    refetchInterval: 30000,
  });

  const navWithBadges = NAV_ITEMS.map(item => ({
    ...item,
    badge: item.id === 'orders' && activeOrderCount ? activeOrderCount : undefined,
  }));

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 220 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="flex flex-col bg-card border-r border-border/60 h-screen relative overflow-hidden z-20"
    >
      {/* Logo */}
      <div className={cn('flex items-center h-14 border-b border-border/60 px-3 drag-region', !collapsed && 'gap-3 px-4')}>
        <div className="w-8 h-8 min-w-[32px] rounded-lg gradient-brand flex items-center justify-center shadow-lg shadow-orange-900/20 no-drag">
          <UtensilsCrossed className="w-4 h-4 text-white" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden no-drag"
            >
              <div className="font-display font-bold text-sm text-foreground leading-none">Eat & Meet</div>
              <div className="text-[10px] text-muted-foreground mt-0.5 tracking-widest uppercase">POS System</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navWithBadges.map(item => {
          const isActive = active === item.id;
          return (
            <motion.button
              key={item.id}
              onClick={() => onChange(item.id)}
              whileTap={{ scale: 0.97 }}
              className={cn(
                'w-full flex items-center rounded-lg transition-all duration-150 group relative',
                collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                isActive
                  ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent'
              )}
              title={collapsed ? item.label : undefined}
            >
              <span className="min-w-[18px]">{item.icon}</span>
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="text-sm font-medium flex-1 text-left overflow-hidden whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {!collapsed && item.badge && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 min-w-[16px] justify-center">
                  {item.badge}
                </Badge>
              )}
              {collapsed && item.badge && (
                <div className="absolute top-1 right-1 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center text-[9px] font-bold text-white">
                  {item.badge}
                </div>
              )}
            </motion.button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-border/60 p-2 space-y-1">
        {/* Notifications */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          className={cn(
            'w-full flex items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-all duration-150',
            collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2'
          )}
        >
          <Bell className="w-4 h-4 min-w-[16px]" />
          {!collapsed && <span className="text-sm">Notifications</span>}
        </motion.button>

        {/* User */}
        {user && (
          <div className={cn('flex items-center rounded-lg p-2 gap-2.5', !collapsed && 'px-3')}>
            <div className="w-8 h-8 min-w-[32px] rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
              {user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex-1 min-w-0"
                >
                  <div className="text-xs font-medium text-foreground truncate">{user.name}</div>
                  <div className="text-[10px] text-muted-foreground capitalize">{user.role.toLowerCase()}</div>
                </motion.div>
              )}
            </AnimatePresence>
            {!collapsed && (
              <button onClick={logout} className="text-muted-foreground hover:text-red-400 transition-colors">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground shadow-sm hover:shadow-md transition-all"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </motion.aside>
  );
}
