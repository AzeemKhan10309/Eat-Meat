import { useState } from 'react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, UtensilsCrossed, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { Button, Input } from '@/components/ui';
import toast from 'react-hot-toast';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password required'),
});
type LoginForm = z.infer<typeof loginSchema>;

const PIN_LENGTH = 4;

export default function LoginPage() {
  const [mode, setMode] = useState<'email' | 'pin'>('email');
  const [showPassword, setShowPassword] = useState(false);
  const [pin, setPin] = useState('');
  const { login, loginWithPin, isLoading, error, clearError } = useAuthStore();

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onEmailLogin = async (data: LoginForm) => {
    try {
      clearError();
      await login(data.email, data.password);
    } catch {
      toast.error('Login failed. Please check your credentials.');
    }
  };

  const handlePinInput = async (digit: string) => {
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === PIN_LENGTH) {
      try {
        clearError();
        await loginWithPin(newPin);
      } catch {
        toast.error('Invalid PIN');
        setPin('');
      }
    }
  };

  const clearPin = () => setPin('');

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-orange-500/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-orange-500/3 blur-3xl" />
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, hsl(var(--border)) 1px, transparent 0)', backgroundSize: '32px 32px', opacity: 0.3 }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-brand mb-4 shadow-lg shadow-orange-900/30">
            <UtensilsCrossed className="w-8 h-8 text-white" />
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground">Eat & Meet</h1>
          <p className="text-muted-foreground text-sm mt-1">Premium Restaurant POS</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border/60 rounded-2xl p-7 shadow-2xl shadow-black/30">
          {/* Mode switcher */}
          <div className="flex p-1 bg-muted rounded-lg mb-6 gap-1">
            {(['email', 'pin'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); clearPin(); clearError(); }}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-all duration-150 ${
                  mode === m
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'email' ? '📧 Email Login' : '🔢 PIN Login'}
              </button>
            ))}
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm"
            >
              {error}
            </motion.div>
          )}

          {mode === 'email' ? (
            <form onSubmit={handleSubmit(onEmailLogin)} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email Address</label>
                <Input
                  {...register('email')}
                  type="email"
                  placeholder="admin@eatandmeet.co.uk"
                  error={errors.email?.message}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</label>
                <Input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  error={errors.password?.message}
                  autoComplete="current-password"
                  rightIcon={
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-muted-foreground hover:text-foreground">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />
              </div>
              <Button type="submit" className="w-full h-11" isLoading={isLoading}>
                {!isLoading && 'Sign In'}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              {/* PIN dots */}
              <div className="flex justify-center gap-3 py-2">
                {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                  <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                    i < pin.length ? 'bg-orange-400 border-orange-400' : 'border-border'
                  }`} />
                ))}
              </div>

              {/* PIN Pad */}
              <div className="grid grid-cols-3 gap-2.5">
                {[1,2,3,4,5,6,7,8,9].map(n => (
                  <motion.button
                    key={n}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => handlePinInput(String(n))}
                    disabled={pin.length >= PIN_LENGTH || isLoading}
                    className="h-14 rounded-xl bg-secondary hover:bg-accent border border-border text-xl font-semibold text-foreground transition-colors disabled:opacity-50"
                  >
                    {n}
                  </motion.button>
                ))}
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={clearPin}
                  className="h-14 rounded-xl bg-secondary hover:bg-accent border border-border text-sm font-medium text-muted-foreground transition-colors"
                >
                  Clear
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={() => handlePinInput('0')}
                  disabled={pin.length >= PIN_LENGTH || isLoading}
                  className="h-14 rounded-xl bg-secondary hover:bg-accent border border-border text-xl font-semibold text-foreground transition-colors disabled:opacity-50"
                >
                  0
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setPin(p => p.slice(0, -1))}
                  className="h-14 rounded-xl bg-secondary hover:bg-accent border border-border text-lg text-muted-foreground transition-colors"
                >
                  ⌫
                </motion.button>
              </div>

              {isLoading && (
                <div className="flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
                </div>
              )}
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground mt-5">
            Default: admin@eatandmeet.co.uk / Admin@123
          </p>
        </div>
      </motion.div>
    </div>
  );
}
