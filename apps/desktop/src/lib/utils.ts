import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatCurrency = (amount: number): string =>
  `Rs ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDate = (date: string | Date): string =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date));

export const formatTime = (date: string | Date): string =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(date));

export const formatDateTime = (date: string | Date): string =>
  `${formatDate(date)} ${formatTime(date)}`;

export const formatTimeAgo = (date: string | Date): string => {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return formatDate(date);
};

export const formatElapsed = (date: string | Date): string => {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
};

export const statusColors = {
  NEW:        { label: 'New',        className: 'status-new' },
  PENDING:    { label: 'Pending',    className: 'status-new' },
  CONFIRMED:  { label: 'Confirmed',  className: 'status-new' },
  PREPARING:  { label: 'Preparing',  className: 'status-preparing' },
  READY:      { label: 'Ready',      className: 'status-ready' },
  SERVED:     { label: 'Served',     className: 'status-served' },
  CANCELLED:  { label: 'Cancelled',  className: 'status-cancelled' },
  REFUNDED:   { label: 'Refunded',   className: 'status-cancelled' },
} as const;

export const tableStatusColors = {
  AVAILABLE:      { label: 'Available', className: 'table-available', dot: 'bg-green-400' },
  OCCUPIED:       { label: 'Occupied',  className: 'table-occupied',  dot: 'bg-orange-400' },
  RESERVED:       { label: 'Reserved',  className: 'table-reserved',  dot: 'bg-blue-400' },
  CLEANING:       { label: 'Cleaning',  className: 'table-cleaning',  dot: 'bg-amber-400' },
  OUT_OF_SERVICE: { label: 'Out of Service', className: '', dot: 'bg-slate-400' },
} as const;
