# BLEnergy – BatteryLab Energy Project Manager

Web system for **BatteryLab Energy (Pvt) Ltd, Kotte** to manage solar / battery-backup projects, contractors, finance and reminders.

- **Frontend:** React + Vite + Tailwind (dark orange / black / gold theme)
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (all data, including uploaded quotations and bills, is stored in the database)

## Features

| Area | What it does |
|---|---|
| Login | Admin account (`BLEAdmin`), JWT sessions, lock-out after repeated failed attempts, password change in Settings |
| Dashboard | Projects, Finance, Contractors and Notifications at a glance, cash-flow chart, upcoming warranties/services |
| Projects | Unique ID (`BLP-YYYY-0001`), customer details with multiple phone numbers, solar panels / inverter / battery (brand, size, warranty), wiring (contractor + addable brands & types), service agreement + service schedule, full summary PDF |
| Contractors | Unique ID (`BLC-0001`), profile with projects done and payment history, profile PDF |
| Finance | Overview dashboard, income, expenses & bills (with attachments), project payment collections, contractor payments, invoices, quotation uploads (PDF/Word). Filters + search everywhere; click a reference to view / download / print the receipt (`BLR-…`) or voucher (`BLV-…`) |
| Notifications | Automatic reminders 2 days before, 1 day before and on the day of warranty expiry, service visits and invoice due dates; activity log |
| Search | Global search (⌘K / Ctrl+K) by project ID, project name, customer, phone, address, date, receipt or invoice number |
| Documents | Every PDF (summary, invoice, receipt, voucher, statement, contractor profile) uses one branded header/footer template. Company details come from **Settings**. |

## First-time setup

Requirements: Node.js 20+ and PostgreSQL 14+.

```bash
createdb blenergy                     # create the database
cp server/.env.example server/.env    # then edit DATABASE_URL and JWT_SECRET
npm run setup                         # install all dependencies
```

Tables are created automatically on first start, together with the admin account
(username `BLEAdmin`, password `adminBL26` – taken from `server/.env`).

## Running

**Development** (hot reload, http://localhost:5173):

```bash
npm run dev
```

**Production** (single server, http://localhost:5050):

```bash
npm run build
npm start
```

## Deploying to Vercel

The repo deploys as one Vercel project with two services (see `vercel.json`): the React app at `/` and the Express API at `/api`.

1. **Database:** in the Vercel project → *Storage* → *Create Database* → **Neon (Postgres)**, region **Singapore** (closest to Sri Lanka), and connect it to the project. This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED` automatically.
2. **Environment variables** (Settings → Environment Variables): `JWT_SECRET` (long random string), `JWT_EXPIRES_IN=12h`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
3. **Function region:** Settings → Functions → region **Singapore (sin1)**, next to the database.
4. Deploy. Tables and the admin account are created automatically on the first request.
5. Sign in and **change the admin password** in Settings.

Notes for the hosted version: uploads are limited to 4 MB per save (Vercel request limit), and reminders are generated while the app is in use (checked at most every 10 minutes) instead of by a background timer.

## Backups

Everything lives in PostgreSQL, so one dump is a full backup:

```bash
pg_dump -Fc blenergy > blenergy-$(date +%F).dump
# restore: pg_restore -d blenergy blenergy-YYYY-MM-DD.dump
```

## Project layout

```
server/            Express API
  src/db/          connection + SQL migrations
  src/routes/      projects, contractors, transactions, invoices, quotations, misc (dashboard, search, notifications, settings)
  src/pdf/         shared branded PDF template
  src/services/    notification scheduler
client/            React app
  src/pages/       dashboard, projects, contractors, finance, notifications, settings
  src/components/  UI kit, layout, charts
```
