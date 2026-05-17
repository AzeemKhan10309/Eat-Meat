import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

// ─── BUTTON ───────────────────────────────────────────────────────────────────

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97]',
  {
    variants: {
      variant: {
        default:     'gradient-brand text-white shadow-lg shadow-orange-900/20 hover:opacity-90',
        secondary:   'bg-secondary text-secondary-foreground hover:bg-accent',
        outline:     'border border-border bg-transparent hover:bg-accent hover:text-accent-foreground',
        ghost:       'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20',
        success:     'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20',
        link:        'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm:      'h-7 px-3 text-xs rounded-md',
        lg:      'h-11 px-6 text-base',
        xl:      'h-14 px-8 text-lg',
        icon:    'h-9 w-9',
        'icon-sm': 'h-7 w-7',
        'icon-lg': 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
);
Button.displayName = 'Button';

// ─── BADGE ────────────────────────────────────────────────────────────────────

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors border',
  {
    variants: {
      variant: {
        default:     'bg-brand-soft text-brand border-transparent',
        secondary:   'bg-secondary text-secondary-foreground border-transparent',
        success:     'bg-green-500/10 text-green-400 border-green-500/20',
        warning:     'bg-amber-500/10 text-amber-400 border-amber-500/20',
        destructive: 'bg-red-500/10 text-red-400 border-red-500/20',
        info:        'bg-blue-500/10 text-blue-400 border-blue-500/20',
        purple:      'bg-purple-500/10 text-purple-400 border-purple-500/20',
        outline:     'text-foreground border-border bg-transparent',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)} {...props} />
);

// ─── CARD ─────────────────────────────────────────────────────────────────────

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-xl bg-card border border-border/60 shadow-sm', className)} {...props} />
  )
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-5 pb-0', className)} {...props} />
  )
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('font-display font-semibold text-foreground leading-none tracking-tight', className)} {...props} />
  )
);
CardTitle.displayName = 'CardTitle';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5 pt-4', className)} {...props} />
  )
);
CardContent.displayName = 'CardContent';

// ─── INPUT ────────────────────────────────────────────────────────────────────

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, leftIcon, rightIcon, error, ...props }, ref) => (
    <div className="relative">
      {leftIcon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
          {leftIcon}
        </div>
      )}
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'transition-colors duration-150',
          leftIcon && 'pl-9',
          rightIcon && 'pr-9',
          error && 'border-destructive ring-destructive',
          className
        )}
        ref={ref}
        {...props}
      />
      {rightIcon && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {rightIcon}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
);
Input.displayName = 'Input';

// ─── STAT CARD ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  trend?: number;
  color?: 'brand' | 'green' | 'blue' | 'purple' | 'red' | 'amber';
}

const colorMap = {
  brand:  'text-orange-400 bg-orange-500/10',
  green:  'text-green-400 bg-green-500/10',
  blue:   'text-blue-400 bg-blue-500/10',
  purple: 'text-purple-400 bg-purple-500/10',
  red:    'text-red-400 bg-red-500/10',
  amber:  'text-amber-400 bg-amber-500/10',
};

const StatCard = ({ label, value, sub, icon, trend, color = 'brand' }: StatCardProps) => (
  <Card className="p-5">
    <div className="flex items-start justify-between">
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold font-display text-foreground">{value}</p>
        {sub && (
          <p className={cn('text-xs', trend !== undefined ? (trend >= 0 ? 'text-green-400' : 'text-red-400') : 'text-muted-foreground')}>
            {trend !== undefined && (trend >= 0 ? '↑ ' : '↓ ')}{sub}
          </p>
        )}
      </div>
      {icon && (
        <div className={cn('p-2.5 rounded-lg', colorMap[color])}>
          {icon}
        </div>
      )}
    </div>
  </Card>
);

// ─── SEPARATOR ────────────────────────────────────────────────────────────────

const Separator = ({ className }: { className?: string }) => (
  <div className={cn('h-px bg-border', className)} />
);

// ─── SKELETON ─────────────────────────────────────────────────────────────────

const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse rounded-md bg-muted', className)} />
);

// ─── EMPTY STATE ─────────────────────────────────────────────────────────────

const EmptyState = ({ icon, title, description, action }: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) => (
  <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
    {icon && <div className="mb-4 text-muted-foreground/40">{icon}</div>}
    <h3 className="font-semibold text-foreground mb-1">{title}</h3>
    {description && <p className="text-sm text-muted-foreground mb-4 max-w-xs">{description}</p>}
    {action}
  </div>
);

export {
  Button, buttonVariants,
  Badge, badgeVariants,
  Card, CardHeader, CardTitle, CardContent,
  Input,
  StatCard,
  Separator,
  Skeleton,
  EmptyState,
};
