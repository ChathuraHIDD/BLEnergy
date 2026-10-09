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
import { startNotificationScheduler } from './services/notifications.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import contractorRoutes from './routes/contractors.js';
import transactionRoutes from './routes/transactions.js';
import invoiceRoutes from './routes/invoices.js';
import quotationRoutes from './routes/quotations.js';
import miscRoutes from './routes/misc.js';

for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`Missing ${key} – copy server/.env.example to server/.env and fill it in`);
    process.exit(1);
  }
}

const app = express();
app.set('trust proxy', 'loopback');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth);
app.use('/api/projects', projectRoutes);
app.use('/api/contractors', contractorRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api', miscRoutes);
app.use('/api', (req, res) => res.status(404).json({ message: 'Endpoint not found' }));

// Serve the built React app in production (npm run build in /client).
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);

const port = Number(process.env.PORT) || 5050;
migrate()
  .then(() => {
    app.listen(port, () => console.log(`⚡ BatteryLab Energy API running on http://localhost:${port}`));
    startNotificationScheduler();
  })
  .catch((err) => {
    console.error('Failed to start:', err.message);
    process.exit(1);
  });
