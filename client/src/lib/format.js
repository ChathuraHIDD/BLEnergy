import dayjs from 'dayjs';

export const lkr = (n, { compact = false } = {}) => {
  const v = Number(n || 0);
  if (compact && Math.abs(v) >= 1e6) return `Rs. ${(v / 1e6).toFixed(v >= 1e8 ? 0 : 2)}M`;
  if (compact && Math.abs(v) >= 1e3) return `Rs. ${(v / 1e3).toFixed(0)}K`;
  return `Rs. ${v.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const fmtDate = (d) => (d ? dayjs(d).format('DD MMM YYYY') : '—');
export const fmtDateTime = (d) => (d ? dayjs(d).format('DD MMM YYYY, hh:mm A') : '—');
export const today = () => dayjs().format('YYYY-MM-DD');
export const label = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const timeAgo = (d) => {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(d);
};

export const fileSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export const daysLabel = (n) => (n < 0 ? `${Math.abs(n)}d overdue` : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`);
