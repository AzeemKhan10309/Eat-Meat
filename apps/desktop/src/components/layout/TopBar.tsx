import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Minus, Square, X, Wifi, WifiOff, Clock, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePrinterStatus } from '@/hooks/usePrinterStatus';
import type { PageId } from './Sidebar';

const PAGE_TITLES: Record<PageId, string> = {
  dashboard: 'Dashboard',
  pos:       'Point of Sale',
  orders:    'Orders',
  inventory: 'Inventory',
  reports:   'Reports',
  expenses:  'Expenses',
  settings:  'Settings',
};

interface TopBarProps {
  activePage: PageId;
}

declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
  }
}

export default function TopBar({ activePage }: TopBarProps) {
  const [time, setTime] = useState(new Date());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const isElectron = Boolean(window.electronAPI);
  const { status: printer } = usePrinterStatus();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    const onOnline  = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);
    return () => { clearInterval(timer); window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  const formatted = time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr   = time.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <header className="h-14 border-b border-border/60 flex items-center justify-between px-5 bg-card/50 backdrop-blur-sm drag-region">
      {/* Left: Page title */}
      <motion.h2
        key={activePage}
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        className="font-display font-semibold text-foreground text-base no-drag"
      >
        {PAGE_TITLES[activePage]}
      </motion.h2>

      {/* Center: Clock */}
      <div className="flex items-center gap-1.5 text-muted-foreground no-drag">
        <Clock className="w-3.5 h-3.5" />
        <span className="font-mono text-sm">{formatted}</span>
        <span className="text-xs text-muted-foreground/60">·</span>
        <span className="text-xs">{dateStr}</span>
      </div>

      {/* Right: Status + window controls */}
      <div className="flex items-center gap-3 no-drag">
        {/* Printer status indicator */}
        <div
          title={printer.detected ? `${printer.name} · ${printer.online ? 'Online' : 'Offline'}` : 'No printer detected'}
          className={cn(
            'flex items-center gap-1.5 text-xs',
            printer.detected && printer.online  ? 'text-green-400'
            : printer.detected                  ? 'text-amber-400'
            :                                     'text-muted-foreground/40'
          )}
        >
          <Printer className="w-3.5 h-3.5" />
        </div>

        <div className={cn('flex items-center gap-1.5 text-xs', isOnline ? 'text-green-400' : 'text-red-400')}>
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span>{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {isElectron && (
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={() => window.electronAPI?.minimize()}
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Minus className="w-3 h-3" />
            </button>
            <button
              onClick={() => window.electronAPI?.maximize()}
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              onClick={() => window.electronAPI?.close()}
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
