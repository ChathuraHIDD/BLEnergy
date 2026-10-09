import { NavLink, Outlet } from 'react-router-dom';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, FileSpreadsheet, FileText, HardHat, LayoutGrid, List, Receipt } from 'lucide-react';

const LINKS = [
  { to: '/finance', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/finance/transactions', label: 'All transactions', icon: List },
  { to: '/finance/income', label: 'Income', icon: ArrowDownLeft },
  { to: '/finance/expenses', label: 'Expenses & bills', icon: ArrowUpRight },
  { to: '/finance/collections', label: 'Project collections', icon: Receipt },
  { to: '/finance/contractor-payments', label: 'Contractor payments', icon: HardHat },
  { to: '/finance/invoices', label: 'Invoices', icon: FileSpreadsheet },
  { to: '/finance/quotations', label: 'Quotations', icon: FileText },
];

export default function FinanceLayout() {
  return (
    <div>
      <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-surface/80 p-1.5">
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => clsx('relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors', isActive ? 'text-black' : 'text-muted hover:text-txt')}>
            {({ isActive }) => (
              <>
                {isActive && <motion.span layoutId="finance-nav" className="bg-brand-gradient absolute inset-0 rounded-xl" transition={{ type: 'spring', bounce: 0.15, duration: 0.45 }} />}
                <l.icon className="relative h-4 w-4" />
                <span className="relative">{l.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
