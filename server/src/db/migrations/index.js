// SQL migrations, embedded as modules so they are bundled with the serverless function.
// Add new migrations as NNN_name.sql files here and list them below (never edit an applied one).

import m0 from './001_init.sql.js';
import m1 from './002_timezone.sql.js';

export default [
  { name: '001_init.sql', sql: m0 },
  { name: '002_timezone.sql', sql: m1 },
];
