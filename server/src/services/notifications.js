import { query } from '../db/index.js';

const WHEN = (expr) => `CASE ${expr} WHEN 0 THEN 'today' WHEN 1 THEN 'tomorrow' ELSE 'in ' || ${expr} || ' days' END`;

/**
 * Creates reminder notifications 2 days before, 1 day before and on the day of:
 *  - component warranty expiry (grouped per project + date)
 *  - scheduled service visits
 *  - invoice due dates with an outstanding balance
 * The unique key (source_type, source_id, event_date, days_before) makes this idempotent.
 */
export async function generateNotifications() {
  await query(`
    INSERT INTO notifications (type, title, message, project_id, source_type, source_id, event_date, days_before)
    SELECT 'warranty',
           'Warranty expires ' || ${WHEN('(c.warranty_expiry - current_date)')},
           p.code || ' – ' || p.customer_name || ': ' ||
             string_agg(initcap(replace(c.component_type, '_', ' ')) || ' (' || c.brand || ', ' || c.size || ')', ', ' ORDER BY c.position) ||
             ' warranty ends on ' || to_char(c.warranty_expiry, 'DD Mon YYYY'),
           p.id, 'warranty', p.id, c.warranty_expiry, (c.warranty_expiry - current_date)
    FROM project_components c
    JOIN projects p ON p.id = c.project_id
    WHERE c.warranty_expiry IS NOT NULL
      AND c.warranty_expiry - current_date BETWEEN 0 AND 2
      AND p.status <> 'cancelled'
    GROUP BY p.id, c.warranty_expiry
    ON CONFLICT DO NOTHING`);

  await query(`
    INSERT INTO notifications (type, title, message, project_id, source_type, source_id, event_date, days_before)
    SELECT 'service',
           'Service visit ' || ${WHEN('(s.service_date - current_date)')},
           p.code || ' – ' || p.customer_name || ': ' || s.title || ' on ' || to_char(s.service_date, 'DD Mon YYYY') ||
             coalesce(' at ' || p.customer_address, ''),
           p.id, 'service', s.id, s.service_date, (s.service_date - current_date)
    FROM project_services s
    JOIN projects p ON p.id = s.project_id
    WHERE s.status = 'scheduled'
      AND s.service_date - current_date BETWEEN 0 AND 2
    ON CONFLICT DO NOTHING`);

  await query(`
    INSERT INTO notifications (type, title, message, project_id, source_type, source_id, event_date, days_before)
    SELECT 'invoice_due',
           'Invoice due ' || ${WHEN('(i.due_date - current_date)')},
           i.code || ' – ' || i.customer_name || ': balance of Rs. ' || to_char(b.balance, 'FM999,999,999,990.00') ||
             ' is due on ' || to_char(i.due_date, 'DD Mon YYYY'),
           i.project_id, 'invoice', i.id, i.due_date, (i.due_date - current_date)
    FROM invoices i
    JOIN invoice_balances b ON b.id = i.id
    WHERE i.status = 'issued' AND i.due_date IS NOT NULL
      AND b.balance > 0
      AND i.due_date - current_date BETWEEN 0 AND 2
    ON CONFLICT DO NOTHING`);
}

export async function notify({ type = 'system', title, message, projectId = null }) {
  await query(
    `INSERT INTO notifications (type, title, message, project_id) VALUES ($1, $2, $3, $4)`,
    [type, title, message, projectId],
  );
}

export function startNotificationScheduler() {
  const run = () => generateNotifications().catch((err) => console.error('Notification job failed:', err.message));
  run();
  return setInterval(run, 30 * 60 * 1000); // every 30 minutes
}
