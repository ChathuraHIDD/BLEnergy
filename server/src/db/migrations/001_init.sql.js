export default `-- BatteryLab Energy – initial schema

CREATE TABLE admins (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
  ('company', '{"name":"BatteryLab Energy (Pvt) Ltd","tagline":"Stationary Power Systems","address":"Kotte, Sri Lanka","phone":"","email":"","website":"","registration":""}');

-- Uploaded files are stored in the database so a single DB backup holds everything.
CREATE TABLE files (
  id            SERIAL PRIMARY KEY,
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  data          BYTEA NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contractors ---------------------------------------------------------------
CREATE SEQUENCE contractor_code_seq;
CREATE TABLE contractors (
  id             SERIAL PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE DEFAULT ('BLC-' || lpad(nextval('contractor_code_seq')::text, 4, '0')),
  name           TEXT NOT NULL,
  phone          TEXT NOT NULL,
  company        TEXT,
  crew_count     INTEGER NOT NULL DEFAULT 0 CHECK (crew_count >= 0),
  email          TEXT,
  address        TEXT,
  specialization TEXT,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX contractors_name_idx ON contractors (lower(name));

-- Projects ------------------------------------------------------------------
CREATE SEQUENCE project_code_seq;
CREATE TABLE projects (
  id                     SERIAL PRIMARY KEY,
  code                   TEXT NOT NULL UNIQUE DEFAULT ('BLP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('project_code_seq')::text, 4, '0')),
  title                  TEXT NOT NULL,
  category               TEXT NOT NULL CHECK (category IN ('solar', 'battery_backup', 'full_solar', 'hybrid', 'other')),
  status                 TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'in_progress', 'completed', 'on_hold', 'cancelled')),
  customer_name          TEXT NOT NULL,
  customer_address       TEXT NOT NULL,
  customer_phones        TEXT[] NOT NULL DEFAULT '{}',
  customer_email         TEXT,
  start_date             DATE,
  installation_date      DATE,
  contract_value         NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (contract_value >= 0),
  description            TEXT,
  wiring_contractor_id   INTEGER REFERENCES contractors (id) ON DELETE SET NULL,
  wiring_notes           TEXT,
  service_agreement      TEXT,
  service_agreement_at   TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX projects_customer_idx ON projects (lower(customer_name));
CREATE INDEX projects_wiring_contractor_idx ON projects (wiring_contractor_id);

CREATE TABLE project_components (
  id              SERIAL PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  component_type  TEXT NOT NULL CHECK (component_type IN ('solar_panel', 'inverter', 'battery')),
  brand           TEXT NOT NULL,
  model           TEXT,
  size            TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  warranty_years  NUMERIC(4, 1) NOT NULL CHECK (warranty_years >= 0),
  warranty_expiry DATE,
  serial_numbers  TEXT,
  position        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX project_components_project_idx ON project_components (project_id);
CREATE INDEX project_components_expiry_idx ON project_components (warranty_expiry);

CREATE TABLE project_wiring (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  brand      TEXT NOT NULL,
  wire_type  TEXT NOT NULL,
  size       TEXT,
  length     TEXT,
  notes      TEXT,
  position   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX project_wiring_project_idx ON project_wiring (project_id);

CREATE TABLE project_services (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  title        TEXT NOT NULL,
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX project_services_date_idx ON project_services (service_date);

-- Brands / wire types that users add by typing.
CREATE TABLE catalog_items (
  id         SERIAL PRIMARY KEY,
  category   TEXT NOT NULL CHECK (category IN ('solar_panel', 'inverter', 'battery', 'wiring_brand', 'wire_type')),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX catalog_items_unique ON catalog_items (category, lower(name));

-- Finance -------------------------------------------------------------------
CREATE SEQUENCE quotation_code_seq;
CREATE TABLE quotations (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE DEFAULT ('BLQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('quotation_code_seq')::text, 4, '0')),
  project_id    INTEGER REFERENCES projects (id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  title         TEXT NOT NULL,
  amount        NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  quote_date    DATE NOT NULL,
  valid_until   DATE,
  status        TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected')),
  file_id       INTEGER REFERENCES files (id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE invoice_code_seq;
CREATE TABLE invoices (
  id               SERIAL PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE DEFAULT ('BLI-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('invoice_code_seq')::text, 4, '0')),
  project_id       INTEGER REFERENCES projects (id) ON DELETE SET NULL,
  customer_name    TEXT NOT NULL,
  customer_address TEXT,
  customer_phone   TEXT,
  issue_date       DATE NOT NULL,
  due_date         DATE,
  discount         NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  tax_rate         NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoice_items (
  id          SERIAL PRIMARY KEY,
  invoice_id  INTEGER NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity    NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
  unit_price  NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  position    INTEGER NOT NULL DEFAULT 0
);

-- Every money movement: project collections, contractor payments, bills, other income/expenses.
CREATE SEQUENCE receipt_code_seq;
CREATE SEQUENCE voucher_code_seq;
CREATE TABLE transactions (
  id             SERIAL PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  kind           TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  category       TEXT NOT NULL,
  amount         NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  txn_date       DATE NOT NULL,
  description    TEXT,
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque', 'card', 'online', 'other')),
  reference      TEXT,
  party          TEXT,
  project_id     INTEGER REFERENCES projects (id) ON DELETE SET NULL,
  contractor_id  INTEGER REFERENCES contractors (id) ON DELETE SET NULL,
  invoice_id     INTEGER REFERENCES invoices (id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transactions_date_idx ON transactions (txn_date);
CREATE INDEX transactions_project_idx ON transactions (project_id);
CREATE INDEX transactions_contractor_idx ON transactions (contractor_id);
CREATE INDEX transactions_invoice_idx ON transactions (invoice_id);

CREATE TABLE transaction_files (
  transaction_id INTEGER NOT NULL REFERENCES transactions (id) ON DELETE CASCADE,
  file_id        INTEGER NOT NULL REFERENCES files (id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, file_id)
);

-- Notifications ---------------------------------------------------------------
CREATE TABLE notifications (
  id          SERIAL PRIMARY KEY,
  type        TEXT NOT NULL CHECK (type IN ('warranty', 'service', 'invoice_due', 'system')),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  project_id  INTEGER REFERENCES projects (id) ON DELETE CASCADE,
  source_type TEXT,
  source_id   INTEGER,
  event_date  DATE,
  days_before INTEGER,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id, event_date, days_before)
);
CREATE INDEX notifications_unread_idx ON notifications (is_read, created_at DESC);

-- Invoice totals and balances (tax applied after discount).
CREATE VIEW invoice_balances AS
SELECT i.id,
       coalesce(it.subtotal, 0)                                                            AS subtotal,
       round((coalesce(it.subtotal, 0) - i.discount) * i.tax_rate / 100, 2)                AS tax_amount,
       round((coalesce(it.subtotal, 0) - i.discount) * (1 + i.tax_rate / 100), 2)          AS total,
       coalesce(pd.paid, 0)                                                                AS paid,
       round((coalesce(it.subtotal, 0) - i.discount) * (1 + i.tax_rate / 100), 2) - coalesce(pd.paid, 0) AS balance
FROM invoices i
LEFT JOIN (SELECT invoice_id, sum(quantity * unit_price) AS subtotal FROM invoice_items GROUP BY invoice_id) it ON it.invoice_id = i.id
LEFT JOIN (SELECT invoice_id, sum(amount) AS paid FROM transactions WHERE kind = 'income' GROUP BY invoice_id) pd ON pd.invoice_id = i.id;
`;
