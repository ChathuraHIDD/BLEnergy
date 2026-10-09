import { NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';
import { Bell, FolderKanban, HardHat, LayoutDashboard, LogOut, Settings, Wallet, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/contractors', label: 'Contractors', icon: HardHat },
  { to: '/finance', label: 'Finance', icon: Wallet },
  { to: '/notifications', label: 'Notifications', icon: Bell, badge: true },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function NavItems({ unread, onNavigate }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            clsx(
              'group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors',
              isActive ? 'text-txt' : 'text-muted hover:bg-surface-2 hover:text-txt',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-xl border border-brand/30 bg-gradient-to-r from-brand/20 via-brand/8 to-transparent"
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
                />
              )}
              {isActive && <span className="bg-brand-gradient absolute top-2 bottom-2 left-0 w-1 rounded-r-full" />}
              <n.icon className={clsx('relative h-[18px] w-[18px]', isActive ? 'text-brand' : 'text-dim group-hover:text-muted')} />
              <span className="relative flex-1">{n.label}</span>
              {n.badge && unread > 0 && (
                <span className="relative rounded-full bg-brand px-2 py-0.5 text-[10px] font-extrabold text-black">{unread > 99 ? '99+' : unread}</span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Panel({ unread, onNavigate }) {
  const { admin, logout } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-6 pb-5">
        <img src="/logo.png" alt="BatteryLab Energy" className="h-14 w-auto" />
      </div>
      <div className="mx-5 mb-5 h-px bg-gradient-to-r from-brand/50 via-gold/30 to-transparent" />
      <div className="flex-1 overflow-y-auto px-3">
        <p className="mb-2 px-3.5 text-[10px] font-bold tracking-[0.2em] text-dim uppercase">Menu</p>
        <NavItems unread={unread} onNavigate={onNavigate} />
      </div>
      <div className="m-3 rounded-2xl border border-line bg-surface-2 p-3">
        <div className="flex items-center gap-3">
          <div className="bg-brand-gradient grid h-9 w-9 place-items-center rounded-xl text-sm font-extrabold text-black">
            {admin?.username?.[0] || 'A'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{admin?.username}</p>
            <p className="text-[11px] text-dim">Administrator</p>
          </div>
          <button onClick={logout} title="Sign out" className="rounded-lg p-2 text-dim transition hover:bg-bad/15 hover:text-bad">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ mobileOpen, onClose, unread }) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface/90 backdrop-blur-xl lg:block">
        <Panel unread={unread} />
      </aside>
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <motion.div className="absolute inset-0 bg-black/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.35 }}
              className="absolute inset-y-0 left-0 w-64 border-r border-line bg-surface"
            >
              <button onClick={onClose} className="absolute top-4 right-3 rounded-lg p-1.5 text-dim hover:text-txt">
                <X className="h-5 w-5" />
              </button>
              <Panel unread={unread} onNavigate={onClose} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
