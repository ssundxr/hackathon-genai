import { CurrencyCode } from './types';

export function formatMoney(amount: number, currency: CurrencyCode | string = 'INR'): string {
  const code = (currency || 'INR').toUpperCase();
  const locale = code === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatCategoryLabel(category: string): string {
  return (category || 'other')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatSourceLabel(source: string): string {
  if (source === 'bank_csv') return 'Bank CSV';
  if (source === 'excel_import') return 'Excel Import';
  return 'Portal Entry';
}
