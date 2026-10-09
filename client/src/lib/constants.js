export const PROJECT_CATEGORIES = [
  { value: 'solar', label: 'Solar (On-grid)' },
  { value: 'battery_backup', label: 'Battery Backup' },
  { value: 'full_solar', label: 'Full Solar System' },
  { value: 'hybrid', label: 'Hybrid (Solar + Battery)' },
  { value: 'other', label: 'Other' },
];

export const PROJECT_STATUSES = [
  { value: 'planning', label: 'Planning', tone: 'info' },
  { value: 'in_progress', label: 'In Progress', tone: 'brand' },
  { value: 'completed', label: 'Completed', tone: 'ok' },
  { value: 'on_hold', label: 'On Hold', tone: 'warn' },
  { value: 'cancelled', label: 'Cancelled', tone: 'bad' },
];

export const COMPONENT_TYPES = [
  { value: 'solar_panel', label: 'Solar Panels', single: 'Solar Panel', sizeHint: 'e.g. 550W', icon: 'sun' },
  { value: 'inverter', label: 'Inverter', single: 'Inverter', sizeHint: 'e.g. 10kW', icon: 'zap' },
  { value: 'battery', label: 'Battery', single: 'Battery', sizeHint: 'e.g. 10kWh / 48V 200Ah', icon: 'battery' },
];

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
  { value: 'online', label: 'Online Payment' },
  { value: 'other', label: 'Other' },
];

export const PROJECT_PAYMENT = 'Project Payment';
export const CONTRACTOR_PAYMENT = 'Contractor Payment';

export const INVOICE_STATUS = {
  paid: { label: 'Paid', tone: 'ok' },
  partial: { label: 'Partially Paid', tone: 'warn' },
  unpaid: { label: 'Unpaid', tone: 'info' },
  overdue: { label: 'Overdue', tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
};

export const QUOTATION_STATUS = {
  draft: { label: 'Draft', tone: 'muted' },
  sent: { label: 'Sent', tone: 'info' },
  accepted: { label: 'Accepted', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
};

export const statusOf = (value) => PROJECT_STATUSES.find((s) => s.value === value) || { label: value, tone: 'muted' };
export const categoryLabel = (value) => PROJECT_CATEGORIES.find((c) => c.value === value)?.label || value;
export const methodLabel = (value) => PAYMENT_METHODS.find((m) => m.value === value)?.label || value;
