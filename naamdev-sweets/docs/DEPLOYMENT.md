# Deployment

The repository ships a single-server production stack with Docker Compose. It suits a launch and
moderate traffic; the same images run on any container platform (see *Scaling* below).

| Service | Image | Role |
|---|---|---|
| `postgres` | `postgres:16-alpine` | Database (volume `pgdata`) |
| `api` | `infra/docker/api.Dockerfile` | Express + Socket.IO + jobs; runs `prisma migrate deploy` on every start (volume `uploads`) |
| `web`, `admin`, `delivery` | `infra/docker/next.Dockerfile` (`APP` build arg) | Next.js standalone servers |
| `caddy` | `caddy:2.8-alpine` | TLS certificates (Let's Encrypt), HTTP/3, HSTS, compression, reverse proxy |
| `backup` | `postgres:16-alpine` + `infra/backup/backup.sh` | Daily `pg_dump` to `./backups`, retention pruning |

## 1. Server and DNS

* A Linux host with Docker Engine 24+ and the Compose plugin; 2 vCPU / 4 GB RAM is enough to start
  (Next.js builds need ~2 GB).
* Four DNS records pointing at the server, e.g. `naamdevsweets.com`, `admin.naamdevsweets.com`,
  `partner.naamdevsweets.com`, `api.naamdevsweets.com`. Open ports 80 and 443 (TCP) and 443 (UDP).

## 2. Configuration

```bash
git clone <your repository> && cd <repository>/naamdev-sweets
cp .env.production.example .env
openssl rand -base64 48   # → JWT_SECRET
openssl rand -hex 32      # → ENCRYPTION_KEY  (keep a copy: it decrypts partner bank details)
openssl rand -base64 32   # → POSTGRES_PASSWORD
```

Fill in the domains, `ACME_EMAIL`, `SEED_ADMIN_*`, and whichever providers you have
([INTEGRATIONS.md](INTEGRATIONS.md)). `NEXT_PUBLIC_*` values are compiled into the front-end
images, so rebuild (`docker compose build web admin delivery`) after changing them.

The API refuses to start in production with `OTP_DEV_ECHO=true` or the example secrets.

## 3. Start

```bash
docker compose up -d --build
docker compose exec api node dist/seed.js     # first deploy only
docker compose ps                             # all services "running"/"healthy"
curl https://api.<your-domain>/health
```

The seed is idempotent and safe to re-run. In production it creates roles and permissions, the
catalogue, content pages, FAQs, default settings, sample coupons/banners and the super admin from
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PHONE` / `SEED_ADMIN_PASSWORD` — **no demo accounts** unless
`SEED_DEMO_ACCOUNTS=true`. Then sign in to the console and:

1. change the super admin password (*Account menu → Change password*);
2. set the store address and map location (*Settings → Store location*) — dispatch and delivery
   fees use it — and review delivery zones/PIN codes;
3. review *Settings* (checkout limits, COD, GST, loyalty, partner pay, business profile with GSTIN
   and FSSAI licence), the catalogue prices and stock, and the seeded coupons and banners;
4. create staff accounts with the narrowest role that fits;
5. check *Settings → Integrations* and register the Razorpay webhook.

## 4. Updates

```bash
git pull
docker compose up -d --build     # API applies pending migrations before it starts listening
```

Migrations are forward-only (`prisma migrate deploy`); take a backup before upgrading.
Create new migrations in development with `pnpm db:migrate` and commit them.

## 5. Backups and restore

* The `backup` service writes `backups/naamdev-YYYYmmdd-HHMMSS.sql.gz` every 24 h
  (`BACKUP_INTERVAL_SECONDS`) and deletes files older than `BACKUP_RETENTION_DAYS` (14).
* **Copy backups off the server** (e.g. `rclone` or `aws s3 sync ./backups s3://…` from cron).
  A backup that only lives on the same disk is not a backup.
* Uploaded media (when Cloudinary is not used) live in the `uploads` volume, including private
  partner KYC documents. Back it up as well:
  `docker run --rm -v naamdev_uploads:/data -v "$PWD/backups":/out alpine tar czf /out/uploads-$(date +%F).tgz -C /data .`
* Restore into an empty database:

  ```bash
  docker compose stop api
  gunzip -c backups/naamdev-<timestamp>.sql.gz | docker compose exec -T postgres psql -U naamdev -d naamdev
  docker compose start api
  ```

  Practise a restore on a staging machine before you need it.

## 6. Logs and monitoring

* All services log to stdout; the API logs structured JSON (pino) with request ids and redacts
  secrets. `docker compose logs -f api`. Configure Docker's log rotation (`/etc/docker/daemon.json`:
  `"log-driver": "local"`) or ship logs to your aggregator (Loki, CloudWatch, Datadog…).
* Health: `GET /health` on the API (database connectivity + integration status) is used by the
  container `HEALTHCHECK`; point an uptime monitor (UptimeRobot, Better Stack…) at
  `https://api.<domain>/health` and at the storefront home page.
* Business health lives in the console: dashboard, low-stock/expiry alerts, payment and refund
  lists, the notification delivery log and the audit log.
* Watch disk space for `pgdata`, `uploads` and `backups`.

## 7. Security checklist

- [ ] `.env` is readable only by the deploy user (`chmod 600 .env`) and never committed.
- [ ] `COOKIE_SECURE=true` (set by compose), `TRUST_PROXY=2` (Caddy → Next.js → API).
- [ ] Razorpay in **live** mode only after test-mode checks pass; webhook secret set.
- [ ] SMS sender id and templates DLT-registered; SPF/DKIM/DMARC for email.
- [ ] Google Maps key restricted to your domains.
- [ ] Postgres is not published to the internet (compose does not expose 5432).
- [ ] Off-site backups and a tested restore.
- [ ] Super admin password changed; staff use individual accounts.

## Scaling and alternatives

* The API is stateless apart from Socket.IO rooms. To run several API replicas, put them behind a
  load balancer with sticky sessions (or add the Socket.IO Redis adapter) — background jobs already
  coordinate through Postgres advisory locks. Use Cloudinary (or shared storage) for uploads.
* Managed PostgreSQL (RDS, Cloud SQL, Neon, Supabase…) works: set `DATABASE_URL`, make sure
  `pg_trgm` is available, and drop the `postgres`/`backup` services in favour of the provider's
  backups.
* The Next.js apps can also be deployed to Vercel or similar with `API_INTERNAL_URL` pointing at the
  public API URL; the API needs a long-running Node host because of Socket.IO and jobs.

## Building images behind a TLS-intercepting proxy

If your build network re-signs TLS, pass the proxy's CA as a BuildKit secret (it is not stored in
the image):

```bash
DOCKER_BUILDKIT=1 docker build --secret id=extra_ca,src=/path/to/ca.pem \
  -f infra/docker/api.Dockerfile -t naamdev/api .
```
