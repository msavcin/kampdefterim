Check Admin Settings Script

Purpose

This diagnostic script connects to the same PostgreSQL database used by your backend (via `DATABASE_URL` or a provided connection string) and prints:
- current database and user
- whether `public.admin_settings` exists
- rows inside `admin_settings` (key/value)
- a quick `campgrounds` row count

How to run

1) On a machine that can reach the PostgreSQL server (your backend/server or a local machine with network access):

```bash
# install dependency (if needed)
npm install pg

# run with env var
DATABASE_URL="postgres://user:pass@host:5432/dbname" node scripts/check_admin_settings.js

# OR pass connection string as first arg
node scripts/check_admin_settings.js "postgres://user:pass@host:5432/dbname"
```

2) If running on the backend server itself, ensure you run it from the project folder so it can reuse local node modules.

3) After running, paste the printed output here.

If you cannot run the script on the server, instead provide the backend process' `DATABASE_URL` value and I can show exact psql commands to run from any machine with network access.

Notes

- Never paste secrets (DB credentials or full JWTs) into public channels. If you need to share output, you can redact passwords.
- If the script shows `admin_settings not found` or rowCount 0, then the backend is connected to a different database than the one you checked with pgAdmin. In that case check the server's `DATABASE_URL` environment variable.

How to inspect server env quickly

- If using pm2:
  - `pm2 show <app-name>` (may show env)
  - `pm2 env <id>` (prints environment variables for a process)

- If using systemd:
  - `systemctl status <service>`
  - Check the service file: `cat /etc/systemd/system/<service>.service` or `systemctl cat <service>`

- If using Docker:
  - `docker ps` to find container id
  - `docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' <container-id>`

If you prefer, I can also produce a small SQL script to run on the server via `psql` instead of Node.
