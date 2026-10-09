import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { timeAgo } from '../../lib/format';
import { NotificationIcon } from '../../pages/NotificationsPage';

export default function NotificationBell({ summary }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const unread = summary?.unread || 0;

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative grid h-11 w-11 place-items-center rounded-xl border border-line bg-surface-2 text-muted transition hover:border-brand/40 hover:text-txt">
        <motion.span animate={unread ? { rotate: [0, -14, 12, -8, 6, 0] } : {}} transition={{ duration: 0.8, repeat: unread ? Infinity : 0, repeatDelay: 6 }}>
          <Bell className="h-5 w-5" />
        </motion.span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[10px] font-extrabold text-black ring-2 ring-base">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="absolute right-0 z-40 mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line-strong bg-surface-2 shadow-2xl shadow-black/70"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="font-bold">Notifications</p>
              <span className="text-xs text-muted">{unread} unread</span>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {!summary?.latest?.length && <p className="p-6 text-center text-sm text-muted">You're all caught up</p>}
              {summary?.latest?.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    setOpen(false);
                    navigate(n.project_id ? `/projects/${n.project_id}` : '/notifications');
                  }}
                  className="flex w-full gap-3 border-b border-line/60 px-4 py-3 text-left transition hover:bg-surface-3"
                >
                  <NotificationIcon type={n.type} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {n.title} {!n.is_read && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                    </p>
                    <p className="line-clamp-2 text-xs text-muted">{n.message}</p>
                    <p className="mt-1 text-[11px] text-dim">{timeAgo(n.created_at)}</p>
                  </div>
                </button>
              ))}
            </div>
            <Link to="/notifications" onClick={() => setOpen(false)} className="block bg-surface-3/60 py-2.5 text-center text-sm font-semibold text-brand hover:text-gold">
              View all notifications
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
