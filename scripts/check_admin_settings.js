#!/usr/bin/env node
/**
 * Check admin_settings diagnostic script
 * Usage:
 *  - Set DATABASE_URL env and run: DATABASE_URL="postgres://user:pass@host:5432/db" node scripts/check_admin_settings.js
 *  - Or pass connection string as first arg: node scripts/check_admin_settings.js "postgres://..."
 */
const { Client } = require('pg');

const arg = process.argv[2];
const conn = process.env.DATABASE_URL || arg;
if (!conn) {
  console.error('Usage: DATABASE_URL="postgres://user:pass@host:5432/db" node scripts/check_admin_settings.js');
  console.error('Or: node scripts/check_admin_settings.js "postgres://user:pass@host:5432/db"');
  process.exit(2);
}

(async () => {
  const client = new Client({ connectionString: conn });
  try {
    await client.connect();
    console.log('Connected to DB (masked):', conn.replace(/:\/\/.+@/, '://***@'));

    const cur = await client.query("SELECT current_database() AS db, current_user AS user");
    console.log('Session info:', cur.rows[0]);

    const reg = await client.query("SELECT to_regclass('public.admin_settings') AS tbl");
    console.log('to_regclass public.admin_settings =>', reg.rows[0].tbl);

    if (!reg.rows[0].tbl) {
      console.log('admin_settings not found in this database.');
    } else {
      const rows = await client.query('SELECT key, value, description, updated_at FROM admin_settings ORDER BY key');
      console.log('admin_settings rowCount:', rows.rowCount);
      if (rows.rowCount > 0) console.table(rows.rows);
    }

    // Extra check
    try {
      const cg = await client.query("SELECT COUNT(*) AS count FROM campgrounds");
      console.log('campgrounds count:', cg.rows[0].count);
    } catch (e) {
      console.warn('Warning: could not query campgrounds table:', e.message);
    }

  } catch (err) {
    console.error('ERROR querying DB:', err.stack || err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
