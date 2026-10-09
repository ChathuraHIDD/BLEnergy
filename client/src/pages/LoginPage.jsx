import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Eye, EyeOff, Lock, ShieldCheck, User } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/api';
import { Button, Field, Input } from '../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(0);

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!username.trim()) errs.username = 'Username is required';
    if (!password) errs.password = 'Password is required';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return setShake((s) => s + 1);
    setLoading(true);
    try {
      const admin = await login(username.trim(), password);
      toast.success(`Welcome back, ${admin.username}`);
      navigate(location.state?.from?.pathname || '/', { replace: true });
    } catch (err) {
      setFormError(errorMessage(err, 'Login failed'));
      setShake((s) => s + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden px-4">
      {/* animated glow */}
      <motion.div
        className="pointer-events-none absolute top-1/2 left-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40 blur-3xl"
        style={{ background: 'conic-gradient(from 0deg, #e4572e, #f27d1f, #f4bb2c, transparent 60%, #e4572e)' }}
        animate={{ rotate: 360 }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#0b0a09_65%)]" />

      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="relative w-full max-w-md">
        <motion.div key={shake} animate={shake ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.4 }}>
          <div className="card !bg-surface/90 p-8 shadow-2xl shadow-black">
            <motion.img initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15 }} src="/logo.png" alt="BatteryLab Energy" className="mx-auto mb-2 h-20" />
            <div className="mx-auto mb-7 h-px w-2/3 bg-gradient-to-r from-transparent via-brand/60 to-transparent" />
            <h1 className="text-center text-xl font-extrabold">Project Management System</h1>
            <p className="mt-1 mb-7 text-center text-sm text-muted">Sign in with your administrator account</p>

            <AnimatePresence>
              {formError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-5 overflow-hidden"
                >
                  <div className="flex items-center gap-2 rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-3 text-sm font-medium text-bad">
                    <AlertCircle className="h-4 w-4 shrink-0" /> {formError}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={submit} className="space-y-4" noValidate>
              <Field label="Username" error={errors.username}>
                <Input icon={User} value={username} error={errors.username} autoFocus autoComplete="username" placeholder="Enter username"
                  onChange={(e) => { setUsername(e.target.value); setErrors((x) => ({ ...x, username: null })); }} />
              </Field>
              <Field label="Password" error={errors.password}>
                <div className="relative">
                  <Input icon={Lock} type={show ? 'text' : 'password'} value={password} error={errors.password} autoComplete="current-password" placeholder="Enter password" className="pr-11"
                    onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: null })); }} />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute top-1/2 right-3 -translate-y-1/2 text-dim hover:text-txt" aria-label="Toggle password visibility">
                    {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
              <Button type="submit" size="lg" className="mt-2 w-full" loading={loading} icon={ShieldCheck}>
                {loading ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
          </div>
        </motion.div>
        <p className="mt-6 text-center text-xs text-dim">© {new Date().getFullYear()} BatteryLab Energy (Pvt) Ltd · Kotte, Sri Lanka</p>
      </motion.div>
    </div>
  );
}
