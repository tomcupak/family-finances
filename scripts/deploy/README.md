# Deploy

The examples use the domain `finances.example.com` and the SSH login `finances` - substitute your own. The deploy scripts take the target from `DEPLOY_TARGET` (`user@host`) in the gitignored repo-root `.env` (see `.env.sample`), so your server never ends up in the repository:

```bash
echo 'DEPLOY_TARGET=finances@finances.example.com' >> .env
```

An explicit `user@host` argument to the scripts (or `DEPLOY_TARGET=... npm run deploy:api`) overrides it. `DEPLOY_SSH_KEY` optionally picks the private key for `ssh`/`scp` (`-i <key> -o IdentitiesOnly=yes`; empty = ssh decides itself - agent, `~/.ssh/config`, default keys). `DEPLOY_MAINTAINER` optionally sets the `.deb`'s Maintainer field.

Two independent deploys:

| | Command | What it does | Where it lands on the server |
|---|---|---|---|
| API (NestJS) | `npm run deploy:api` | `.deb` with a systemd service, installed via `sudo dpkg -i` | `/opt/family-finances/api`, service `family-finances-api` |
| Web (static SPA) | `npm run deploy:web` | zip, unpacked over SSH without sudo | `/var/www/family-finances/web` |

`npm run deploy` runs both one after the other.

## Server setup (once)

Assumes Debian/Ubuntu on **amd64**. The `.deb` takes its architecture from the machine you build on (`uname -m`), and WSL is x86_64. Run everything as root, or with `sudo`.

### 1. Packages

```bash
apt update
apt install -y nginx postgresql unzip certbot python3-certbot-nginx
```

Node.js isn't needed on the server. The `.deb` bundles its own Node.js runtime (`NODE_VERSION` in `lib.sh`).

### 2. Users

There are two users, and they're different on purpose:

- **`finances`** is the SSH login the deploy scripts use. It may run only `dpkg -i` of the API package as root.
- **`family-finances`** is the system user the API runs as. It has no login and no sudo. If both were the same user, the service would run with sudo rights.

```bash
# SSH login for deploys
adduser --disabled-password --gecos "" finances
install -d -m 700 -o finances -g finances /home/finances/.ssh
# put the public key from the machine you deploy from (WSL: ~/.ssh/id_ed25519.pub) here:
nano /home/finances/.ssh/authorized_keys
chown finances:finances /home/finances/.ssh/authorized_keys
chmod 600 /home/finances/.ssh/authorized_keys

# sudo without a password just for installing the API package (the deploy runs non-interactively, `sudo -n`)
cat > /etc/sudoers.d/finances-deploy <<'EOF'
finances ALL=(root) NOPASSWD: /usr/bin/dpkg -i /tmp/family-finances-api_*_amd64.deb
EOF
chmod 440 /etc/sudoers.d/finances-deploy
visudo -cf /etc/sudoers.d/finances-deploy

# system user for the service (the package's postinst would create it too, but api.env needs it beforehand)
useradd --system --no-create-home --shell /usr/sbin/nologin family-finances
```

> Being allowed to `dpkg -i` means root access in practice, because the package's postinst runs as root. The sudoers rule guards against mistakes, not against an attacker holding the `finances` key. Protect that key accordingly.

### 3. Directories and permissions

| Path | Owner | Mode | Purpose |
|---|---|---|---|
| `/etc/family-finances` | `root:root` | `755` | config root |
| `/etc/family-finances/api.env` | `root:family-finances` | `640` | API secrets, read only by the service |
| `/etc/family-finances/web` | `finances:finances` | `755` | web runtime config, the deploy writes here without sudo |
| `/etc/family-finances/web/config.json` | `finances:finances` | `644` | `apiUrl`, Nginx (`www-data`) must be able to read it |
| `/var/www/family-finances` | `finances:finances` | `755` | the web deploy creates `web/` and `web.old/` here |
| `/opt/family-finances/api` | `root:root` | – | created by the `.deb`, the service only reads it (don't create it by hand) |
| `/var/lib/postgresql` | `postgres` | – | DB data, managed by the `postgresql` package |

```bash
install -d -m 755 -o root     -g root     /etc/family-finances
install -d -m 755 -o finances -g finances /etc/family-finances/web
install -d -m 755 -o finances -g finances /var/www/family-finances
```

The first web deploy seeds `config.json` from the build. Edit it afterwards (see step 7).

### 4. PostgreSQL

```bash
DB_PASSWORD="$(openssl rand -hex 24)"; echo "$DB_PASSWORD"   # goes into api.env below
sudo -u postgres psql -c "CREATE ROLE family_finances LOGIN PASSWORD '$DB_PASSWORD'"
sudo -u postgres createdb -O family_finances family_finances
```

The API runs the migrations itself on every start. The DB owner is allowed to create the `drizzle` schema and the tables.

### 5. API secrets – `/etc/family-finances/api.env`

```bash
cat > /etc/family-finances/api.env <<EOF
API_HOST=127.0.0.1
API_PORT=3000
API_TOKEN=$(openssl rand -hex 32)
CORS=https://finances.example.com

POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=family_finances
POSTGRES_USER=family_finances
POSTGRES_PASSWORD=$DB_PASSWORD
EOF
chown root:family-finances /etc/family-finances/api.env
chmod 640 /etc/family-finances/api.env
grep API_TOKEN /etc/family-finances/api.env   # this is the token you paste into the web app's login screen
```

The systemd unit sets `NODE_ENV=production`. Without `API_TOKEN` or `POSTGRES_PASSWORD` the API then refuses to start, instead of falling back to the public dev defaults. `API_HOST=127.0.0.1` makes the API listen only for Nginx. The port isn't reachable from outside. No package or reinstall ever overwrites this file.

### 6. Nginx + TLS

`/etc/nginx/sites-available/family-finances`:

```nginx
server {
	listen 80;
	server_name finances.example.com;

	root /var/www/family-finances/web;
	index index.html;

	# API under /api/ - the trailing slash in proxy_pass strips the prefix (/api/v1/... -> /v1/...)
	location /api/ {
		proxy_pass http://127.0.0.1:3000/;
		proxy_set_header Host $host;
		proxy_set_header X-Real-IP $remote_addr;
		proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto $scheme;
	}
	# Swagger isn't needed publicly (orval generates against the local API)
	location ^~ /api/swagger { return 404; }

	location /assets/ {
		add_header Cache-Control "public, max-age=31536000, immutable";
		try_files $uri =404;
	}
	location = /config.json { add_header Cache-Control "no-cache"; }
	location = /version.json { add_header Cache-Control "no-cache"; }
	# PWA manifest - older nginx mime.types don't know .webmanifest
	location = /manifest.webmanifest {
		default_type application/manifest+json;
		add_header Cache-Control "no-cache";
	}

	# SPA fallback - every app route gets index.html
	location / {
		add_header Cache-Control "no-cache";
		try_files $uri /index.html;
	}
}
```

```bash
ln -s /etc/nginx/sites-available/family-finances /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d finances.example.com   # adds the 443 server block and the redirect, renews itself
```

The DNS `A` record for `finances.example.com` must point at the server before you run certbot.

### 7. First deploy

From the repo, on the machine you deploy from:

```bash
ssh finances@finances.example.com true   # check the key works (and accept the host key)
npm run deploy
```

Then on the server, point the web at the API:

```bash
cat > /etc/family-finances/web/config.json <<'EOF'
{
	"apiUrl": "https://finances.example.com/api"
}
EOF
```

No restart is needed. The app reads `config.json` on every page load.

## Deploying (every time)

```bash
npm run deploy:api   # or deploy:web, or deploy (both)
```

### API (`scripts/deploy/*.sh`)

- `build.sh api`: `nest build api`. The `@family-finances/*` libs get bundled into `main.js` (the `externals` allowlist in `webpack.common.mjs`). Without it they would stay as runtime `require()` calls of TS source through the workspace symlinks.
- `package-deb.sh api [--skip-build]` produces `dist-deploy/family-finances-api_<version>_amd64.deb`. It contains `main.js`, the migrations (`libs/database/src/core/migrations`, read from disk at runtime), production `node_modules` (`npm ci --omit=dev` in a temp dir, your local `node_modules` stays untouched) and the Node.js runtime. It contains no `.env`.
- `deploy-deb.sh api [user@host]`: build + `scp` to `/tmp` + `sudo -n dpkg -i`. Then the postinst runs `systemctl daemon-reload`, `enable` and `restart family-finances-api`, and the script prints the service status.
- The unit has `Restart=on-failure`, `ProtectSystem=strict` and `ProtectHome`. The API doesn't write anything to disk.

`npm ci` needs `package-lock.json` in sync with `package.json`. If it fails with `Missing: … from lock file`, run `npm install --package-lock-only` and commit the lock.

### Web (`scripts/deploy/web/*.sh`)

- `package.sh family-finances [--skip-build]`: `npm run build:web` → `dist-deploy/web-family-finances.zip` (contents of `web/dist/family-finances`).
- `deploy.sh family-finances [user@host] [remote_dir]` unpacks to `remote_dir.new`, swaps it in and keeps the previous version as `remote_dir.old`. `config.json` in the deployed tree is a symlink to `/etc/family-finances/web/config.json`, so a redeploy never overwrites it. It doesn't use sudo. It fails if `/etc/family-finances/web` doesn't exist.
- Only `assets/*` have a hash in the file name. `index.html`/`config.json`/`version.json`/`manifest.webmanifest` (and the icons via the `/` location) are served with `no-cache`, so a plain reload after a deploy is enough.

## Operations

```bash
ssh finances@finances.example.com systemctl status family-finances-api
ssh finances@finances.example.com journalctl -u family-finances-api -f    # needs the adm/systemd-journal group, otherwise use sudo on the server
```

- **Web rollback**: on the server `cd /var/www/family-finances && mv web web.bad && mv web.old web`.
- **API rollback**: check out the previous commit and run `npm run deploy:api` (the package version is always `package.json`'s `version`, so `dpkg -i` overwrites the current one).
- **Removing the API**: `apt-get remove family-finances-api` stops and disables the service. `/etc/family-finances` and the DB stay.
- **DB backup** (optional, as root): a directory `install -d -m 700 -o postgres -g postgres /var/backups/family-finances` and a cron entry for `postgres`, e.g. `0 3 * * * pg_dump -Fc family_finances > /var/backups/family-finances/$(date +\%u).dump` (7 rolling days).

To let `finances` read the logs without sudo: `usermod -aG systemd-journal finances`.
