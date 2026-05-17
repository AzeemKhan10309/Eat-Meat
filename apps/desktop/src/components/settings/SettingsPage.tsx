import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, User, Settings2, Printer, Shield, Plus, Wifi, WifiOff, RefreshCw, CheckCircle2, AlertCircle, Zap } from 'lucide-react';
import { usePrinterStatus } from '@/hooks/usePrinterStatus';
import api from '@/services/api';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Button, Input, Card, CardHeader, CardTitle, CardContent, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

type SettingsTab = 'restaurant' | 'users' | 'printer' | 'security';

interface RestaurantSettings {
  name: string; address: string; phone: string; email: string; taxId: string;
  taxRate: number; serviceChargeRate: number; receiptFooter: string;
  currencySymbol: string; timezone: string;
}

interface StaffUser {
  id: string; name: string; email: string; role: string; isActive: boolean; lastLogin?: string;
}

const ROLE_COLORS: Record<string, string> = {
  SUPER_ADMIN:   'bg-purple-500/10 text-purple-400 border-purple-500/20',
  ADMIN:         'bg-blue-500/10   text-blue-400   border-blue-500/20',
  MANAGER:       'bg-orange-500/10 text-orange-400 border-orange-500/20',
  CASHIER:       'bg-green-500/10  text-green-400  border-green-500/20',
  KITCHEN_STAFF: 'bg-amber-500/10  text-amber-400  border-amber-500/20',
};

const TABS = [
  { id: 'restaurant', icon: <Settings2 className="w-4 h-4" />, label: 'Restaurant' },
  { id: 'users',      icon: <User       className="w-4 h-4" />, label: 'Staff & Users' },
  { id: 'printer',    icon: <Printer    className="w-4 h-4" />, label: 'Printer' },
  { id: 'security',   icon: <Shield     className="w-4 h-4" />, label: 'Security' },
] as const;

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<SettingsTab>('restaurant');
  const [settingsForm, setSettingsForm] = useState<Partial<RestaurantSettings>>({});
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'CASHIER' });
  const [showAddUser, setShowAddUser] = useState(false);
  const [testPrintMsg, setTestPrintMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { status: printerStatus, loading: printerLoading, forceDetect, testPrint } = usePrinterStatus();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then(r => r.data.data),
    onSuccess: (data: RestaurantSettings) => setSettingsForm(data),
  } as Parameters<typeof useQuery>[0]);

  const { data: users = [] } = useQuery<StaffUser[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data.data),
    enabled: tab === 'users',
  });

  const saveSettings = useMutation({
    mutationFn: () => api.patch('/settings', settingsForm),
    onSuccess: () => { toast.success('Settings saved'); queryClient.invalidateQueries({ queryKey: ['settings'] }); },
    onError:   () => toast.error('Failed to save settings'),
  });

  const createUser = useMutation({
    mutationFn: () => api.post('/users', newUser),
    onSuccess: () => {
      toast.success('User created');
      setNewUser({ name: '', email: '', password: '', role: 'CASHIER' });
      setShowAddUser(false);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => toast.error('Failed to create user'),
  });

  const toggleUserActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/users/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const field = (key: keyof RestaurantSettings, label: string, type = 'text', step?: string) => (
    <div>
      <label className="text-xs text-muted-foreground block mb-1.5">{label}</label>
      <Input
        type={type}
        step={step}
        value={String(settingsForm[key] ?? '')}
        onChange={e => setSettingsForm(f => ({ ...f, [key]: type === 'number' ? parseFloat(e.target.value) : e.target.value }))}
      />
    </div>
  );

  return (
    <div className="h-full flex">
      {/* Settings sidebar */}
      <div className="w-48 border-r border-border/60 p-3 space-y-1">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border',
              tab === t.id
                ? 'border-orange-500/30 bg-orange-500/10 text-orange-400'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Restaurant Settings */}
        {tab === 'restaurant' && (
          <div className="max-w-xl space-y-6">
            <h3 className="font-display font-semibold text-foreground text-lg">Restaurant Details</h3>
            <div className="grid grid-cols-2 gap-4">
              {field('name',    'Restaurant Name')}
              {field('email',   'Email Address', 'email')}
              {field('phone',   'Phone Number',  'tel')}
              {field('taxId',   'Tax / VAT ID')}
              {field('address', 'Address')}
              {field('timezone','Timezone')}
            </div>

            <h4 className="font-semibold text-foreground pt-2">Financial Settings</h4>
            <div className="grid grid-cols-3 gap-4">
              {field('taxRate',          'Tax Rate',           'number', '0.01')}
              {field('serviceChargeRate','Service Charge Rate','number', '0.01')}
              {field('currencySymbol',   'Currency Symbol')}
            </div>

            <h4 className="font-semibold text-foreground pt-2">Receipt</h4>
            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Receipt Footer</label>
              <textarea
                value={String(settingsForm.receiptFooter ?? '')}
                onChange={e => setSettingsForm(f => ({ ...f, receiptFooter: e.target.value }))}
                rows={3}
                className="w-full bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring resize-none"
                placeholder="Thank you for dining with us!"
              />
            </div>

            <Button isLoading={saveSettings.isPending} onClick={() => saveSettings.mutate()}>
              <Save className="w-4 h-4" />
              Save Settings
            </Button>
          </div>
        )}

        {/* Users */}
        {tab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-foreground text-lg">Staff & Users</h3>
              <Button size="sm" onClick={() => setShowAddUser(s => !s)}>
                <Plus className="w-4 h-4" />
                Add User
              </Button>
            </div>

            {showAddUser && (
              <Card className="p-4">
                <h4 className="font-semibold text-sm text-foreground mb-3">New User</h4>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Input placeholder="Full Name" value={newUser.name} onChange={e => setNewUser(u => ({ ...u, name: e.target.value }))} />
                  <Input placeholder="Email" type="email" value={newUser.email} onChange={e => setNewUser(u => ({ ...u, email: e.target.value }))} />
                  <Input placeholder="Password" type="password" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} />
                  <select
                    value={newUser.role}
                    onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}
                    className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none"
                  >
                    {['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN_STAFF'].map(r => (
                      <option key={r} value={r}>{r.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowAddUser(false)}>Cancel</Button>
                  <Button size="sm" isLoading={createUser.isPending} onClick={() => createUser.mutate()}>Create User</Button>
                </div>
              </Card>
            )}

            <div className="space-y-2">
              {(users as StaffUser[]).map(user => (
                <div key={user.id} className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border/60">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-semibold border', ROLE_COLORS[user.role] || 'bg-muted text-muted-foreground border-border')}>
                    {user.role.replace('_', ' ')}
                  </span>
                  <button
                    onClick={() => toggleUserActive.mutate({ id: user.id, isActive: !user.isActive })}
                    className={cn(
                      'w-10 h-5 rounded-full border-2 transition-colors relative',
                      user.isActive ? 'bg-green-500 border-green-400' : 'bg-muted border-border'
                    )}
                  >
                    <div className={cn('absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all', user.isActive ? 'left-4' : 'left-0.5')} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Printer */}
        {tab === 'printer' && (
          <div className="max-w-lg space-y-5">
            <h3 className="font-display font-semibold text-foreground text-lg">Printer</h3>

            {/* Live status card */}
            <Card className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center',
                    printerStatus.detected && printerStatus.online
                      ? 'bg-green-500/10 text-green-400'
                      : printerStatus.detected
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-muted text-muted-foreground'
                  )}>
                    {printerStatus.detected && printerStatus.online
                      ? <CheckCircle2 className="w-5 h-5" />
                      : printerStatus.detected
                        ? <Printer className="w-5 h-5" />
                        : <AlertCircle className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {printerStatus.name ?? 'No printer detected'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {printerStatus.detected ? (
                        <>
                          <span className={cn(
                            'flex items-center gap-1 text-xs',
                            printerStatus.online ? 'text-green-400' : 'text-amber-400'
                          )}>
                            {printerStatus.online
                              ? <><Wifi className="w-3 h-3" /> Online</>
                              : <><WifiOff className="w-3 h-3" /> Offline</>}
                          </span>
                          <span className="text-muted-foreground text-xs">·</span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            {printerStatus.method === 'escpos' ? 'ESC/POS' : 'Text mode'}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Plug in a USB thermal printer to auto-detect
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={forceDetect}
                  disabled={printerLoading}
                  className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title="Re-scan for printers"
                >
                  <RefreshCw className={cn('w-4 h-4', printerLoading && 'animate-spin')} />
                </button>
              </div>

              {/* Status bar */}
              <div className={cn(
                'h-1.5 rounded-full mb-4',
                printerStatus.detected && printerStatus.online
                  ? 'bg-green-500'
                  : printerStatus.detected
                    ? 'bg-amber-400'
                    : 'bg-muted'
              )} />

              {/* Test print */}
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!printerStatus.detected || printerLoading}
                  onClick={async () => {
                    setTestPrintMsg(null);
                    const res = await testPrint();
                    setTestPrintMsg({ ok: res.success, text: res.message });
                    setTimeout(() => setTestPrintMsg(null), 5000);
                  }}
                >
                  <Printer className="w-4 h-4" />
                  Test Print
                </Button>
                {testPrintMsg && (
                  <span className={cn('text-xs', testPrintMsg.ok ? 'text-green-400' : 'text-red-400')}>
                    {testPrintMsg.text}
                  </span>
                )}
              </div>
            </Card>

            {/* How it works */}
            <Card className="p-4 space-y-3">
              <h4 className="text-sm font-semibold text-foreground">How auto-detection works</h4>
              <ul className="space-y-2 text-xs text-muted-foreground">
                {[
                  'Connect any USB ESC/POS thermal printer (Epson, XPrinter, TYSSO, Bixolon, Star…)',
                  'The server scans for it every 10 seconds and connects automatically',
                  'ESC/POS mode is used when the printer driver supports it — text fallback otherwise',
                  'Receipts print automatically after every successful payment',
                  'Disconnect the printer and it will be detected as offline within 10 seconds',
                ].map((tip, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-orange-400 font-mono mt-0.5">{i + 1}.</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Receipt preview */}
            <Card className="p-4">
              <h4 className="font-semibold text-sm text-foreground mb-3">Receipt Preview</h4>
              <div className="font-mono text-[11px] bg-muted p-3 rounded-lg text-muted-foreground whitespace-pre leading-relaxed overflow-x-auto">
{`================================================
          EAT & MEET RESTAURANT
     12 Baker Street, London W1U 3BG
           +44 20 7946 0000
================================================
Order:   ORD-20241201-0001
Date:    01/12/2024 19:45
Cashier: James Davis
Type:    TAKEAWAY
------------------------------------------------
ITEM                                       TOTAL
------------------------------------------------
Truffle Wagyu Burger
  1 x Rs24.99                           Rs24.99
Loaded Fries
  2 x Rs7.99                            Rs15.98
------------------------------------------------
Subtotal:                               Rs40.97
Tax:                                     Rs4.10
================================================
TOTAL:                                  Rs45.07
------------------------------------------------
Payment:                                   CASH
Cash:                                   Rs50.00
Change:                                  Rs4.93
================================================
          Thank you for dining with us!
            www.eatandmeet.co.uk`}
              </div>
            </Card>
          </div>
        )}

        {/* Security */}
        {tab === 'security' && (
          <div className="max-w-md space-y-5">
            <h3 className="font-display font-semibold text-foreground text-lg">Security Settings</h3>
            <Card className="p-4 space-y-4">
              <h4 className="font-semibold text-sm text-foreground">Change Password</h4>
              <div className="space-y-3">
                <Input type="password" placeholder="Current password" />
                <Input type="password" placeholder="New password" />
                <Input type="password" placeholder="Confirm new password" />
                <Button><Save className="w-4 h-4" />Update Password</Button>
              </div>
            </Card>
            <Card className="p-4 space-y-3">
              <h4 className="font-semibold text-sm text-foreground">Session Settings</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Auto-logout after inactivity</span>
                  <select className="bg-secondary border border-border rounded-lg px-2 py-1 text-xs text-foreground outline-none">
                    <option>Never</option>
                    <option>15 minutes</option>
                    <option>30 minutes</option>
                    <option>1 hour</option>
                  </select>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
