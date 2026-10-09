import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import Sidebar from './Sidebar';
import GlobalSearch from './GlobalSearch';
import NotificationBell from './NotificationBell';

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { data: summary } = useQuery({
    queryKey: ['notifications', 'summary'],
    queryFn: () => api.get('/notifications/summary').then((r) => r.data),
    refetchInterval: 60000,
  });

  // Toast when new reminders arrive while the app is open.
  const lastSeen = useRef(null);
  useEffect(() => {
    const newest = summary?.latest?.[0];
    if (!newest) return;
    if (lastSeen.current !== null && newest.id > lastSeen.current && !newest.is_read) {
      toast(newest.title, { description: newest.message });
    }
    lastSeen.current = Math.max(lastSeen.current ?? 0, newest.id);
  }, [summary]);

  return (
    <div className="min-h-screen">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} unread={summary?.unread || 0} />
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-line bg-base/80 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3 md:px-8">
            <button onClick={() => setMobileOpen(true)} className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface-2 text-muted lg:hidden">
              <Menu className="h-5 w-5" />
            </button>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden text-right xl:block">
                <p className="text-xs font-semibold text-muted">{new Date().toLocaleDateString('en-GB', { weekday: 'long' })}</p>
                <p className="text-sm font-bold">{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              </div>
              <NotificationBell summary={summary} />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname.split('/').slice(0, 3).join('/')}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
