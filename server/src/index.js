import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { migrate } from './db/migrate.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './utils/errors.js';
import { generateNotifications, startNotificationScheduler } from './services/notifications.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import contractorRoutes from './routes/contractors.js';
import transactionRoutes from './routes/transactions.js';
import invoiceRoutes from './routes/invoices.js';
import quotationRoutes from './routes/quotations.js';
import miscRoutes from './routes/misc.js';

const ON_VERCEL = Boolean(process.env.VERCEL);

for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`Missing ${key} – set it in server/.env (local) or in the Vercel project environment variables`);
    if (!ON_VERCEL) process.exit(1);
  }
}

// Create/upgrade tables once per instance before handling the first request.
let ready;
const ensureReady = () => {
  ready ??= migrate().catch((err) => {
    ready = undefined;
    throw err;
  });
  return ready;
};

// On Vercel there is no long-running process, so reminders are generated on demand
// (throttled) while the app is in use instead of by a timer.
let lastReminderRun = 0;
const runRemindersIfDue = () => {
  if (Date.now() - lastReminderRun < 10 * 60 * 1000) return;
  lastReminderRun = Date.now();
  generateNotifications().catch((err) => console.error('Notification job failed:', err.message));
};

const app = express();
app.set('trust proxy', ON_VERCEL ? true : 'loopback');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
// The web app is served from the same domain; only enable CORS for explicitly allowed origins.
if (process.env.CORS_ORIGIN) app.use(cors({ origin: process.env.CORS_ORIGIN.split(',') }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan(ON_VERCEL ? 'tiny' : 'dev'));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', async (req, res, next) => {
  try {
    await ensureReady();
    if (ON_VERCEL) runRemindersIfDue();
    next();
  } catch (err) {
    console.error('Database not ready:', err.message);
    res.status(503).json({ message: 'Database is not reachable. Please try again shortly' });
  }
});
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth);
app.use('/api/projects', projectRoutes);
app.use('/api/contractors', contractorRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api', miscRoutes);
app.use('/api', (req, res) => res.status(404).json({ message: 'Endpoint not found' }));

// Local production mode: serve the built React app (on Vercel the client is its own service).
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (!ON_VERCEL && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);

if (!ON_VERCEL) {
  const port = Number(process.env.PORT) || 5050;
  ensureReady()
    .then(() => {
      app.listen(port, () => console.log(`⚡ BatteryLab Energy API running on http://localhost:${port}`));
      startNotificationScheduler();
    })
    .catch((err) => {
      console.error('Failed to start:', err.message);
      process.exit(1);
    });
}

export default app;
