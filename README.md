# uy-ev-chargers

Availability tracker for Uruguay's public EV charging network, built on the station feed
UTE publishes behind [movilidad.ute.com.uy](https://movilidad.ute.com.uy/mapa.html).

The official map shows the present moment and keeps no history. This project polls the same
feed every fifteen minutes, records each state change, and exposes the result as a map,
availability metrics, and a queryable history.

## Stack

Next.js 16 (App Router) · TypeScript · Drizzle ORM · Neon Postgres · Leaflet · Vitest with
PGlite. Requires Node.js 20.9 or later.

## Data source

```
GET https://movilidad.ute.com.uy/api/v1/station/status/map
```

Unauthenticated. As of August 2026 it returns 212 stations and 494 connectors across the 19
departments, with connectors pre-aggregated by type, power and cable attachment rather than
listed individually. A sibling endpoint, `/api/v1/station/status/list`, requires auth and
returns 401.

The feed needs cleaning before use: department names arrive with inconsistent casing,
accents and trailing whitespace (`Río negro`, `Colonia `), and there is no stable station
identifier of any kind.

### Known limitation: the status field is not usable

Every connector in the feed reports `Busy` and every station reports `Cargando`. Across
sampling, the endpoint returned a byte-identical payload each time. As long as that holds,
`statusDetail` carries no fault signal.

The design accounts for this rather than assuming the field works:

- Every poll stores a SHA-256 digest of the response body, so the API can report how long
  UTE has been republishing identical bytes (`identicalPayloadStreak`, `unchangedSince`).
  The dashboard shows a warning when that streak grows, because otherwise a dead feed reads
  as a perfectly healthy network.
- Availability is derived from several independent signals, not from `statusDetail` alone:
  stations leaving the feed, stations listed without any connector telemetry, connector
  groups losing capacity, and fault states if they begin to appear.

If upstream starts publishing real statuses, the same pipeline records them with no changes.

## How availability is measured

Connector state is stored as **validity intervals**, not one row per poll. A row is written
only when state actually changes, so the table grows with real-world churn rather than with
polling frequency. This is what makes long retention affordable: at 0.5 GB, a row-per-poll
schema fills up in about ten weeks, while interval storage holds years.

| Health | Meaning |
| --- | --- |
| `operational` | Reported in a state where a driver can charge |
| `faulted` | Reported as faulted, unavailable, offline or out of order |
| `absent` | Stopped appearing in the feed; carries the last known connector count |
| `unknown` | A label the classifier does not recognise |

`unknown` is never folded into `operational`. The feed is undocumented, so treating an
unrecognised label as healthy would quietly understate outages.

A single group can hold several concurrent states, because UTE splits a bank of otherwise
identical connectors into separate entries when they are not all in the same condition.

Station presence is tracked separately as `listed`, `silent` (present but never reported any
connector telemetry) or `delisted` (gone from the feed).

Per-station availability is weighted by connector count and outage duration, so a
six-connector site down for a day outranks a single-connector site down for a day.

Daily buckets follow `America/Montevideo`, passed explicitly to Postgres. Relying on the
session default would silently shift every bucket depending on where the query ran.

A failed poll is recorded but never mutates station or connector state. Upstream being
unreachable says nothing about whether a charger works, and closing intervals on that signal
would fabricate outages.

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/stations` | All stations with current health tallies |
| `GET /api/stations/{slug}?days=30` | One station and its state timeline |
| `GET /api/metrics/overview?days=30` | Network snapshot, feed health, department and connector breakdowns |
| `GET /api/metrics/history?days=90` | Daily series of tracked and out-of-service connectors |
| `GET /api/metrics/reliability?days=30&limit=50` | Per-station availability ranking |
| `GET /api/health` | Database reachability and data freshness |

## Published data

A daily workflow writes the collected history into `data/` and commits it:

- `network-history.csv` — one row per local day
- `stations.json` — every station with its current health tally

The database is the working store; these files are the public record, auditable without
database access. See [`data/README.md`](data/README.md) for the column definitions.

## Layout

```
src/lib/ute/        Feed client, payload validation, normalisation, health classification
src/lib/ingest/     Poll, diff against stored state, write intervals
src/lib/metrics/    Interval arithmetic and aggregate queries
src/lib/db/         Drizzle schema and connection handles
src/app/            Dashboard, station pages, JSON API
scripts/            Migration, polling and snapshot entry points
tests/              Ingestion, metrics and feed-client suites
```

## Local development

```bash
npm install
cp .env.example .env        # set DATABASE_URL
npm run db:migrate
npm run poll                # one ingestion pass
npm run dev
```

Tests run against an in-process Postgres (PGlite) with the production migrations applied, so
they need no database and no network:

```bash
npm test
npm run typecheck
npm run lint
```

## Deployment

The web app runs on Vercel. The poller runs as a GitHub Actions scheduled workflow instead of
a Vercel cron job, because Vercel's Hobby plan caps cron jobs at one run per day.

Both need `DATABASE_URL` — a Vercel environment variable, and a GitHub repository secret of
the same name.

### Why fifteen minutes

Neon's free tier allows 100 CU-hours per month and scales compute to zero after five minutes
of inactivity. Polling more often keeps the database permanently awake:

| Interval | CU-hours/month | Within free tier |
| --- | --- | --- |
| 5 min | ~182 | No |
| 10 min | ~92 | Marginal |
| 15 min | ~61 | Yes |

Fifteen minutes still gives 96 observations per connector per day, which is well past what
uptime reporting needs.

### Keeping the schedule alive

GitHub disables scheduled workflows in public repositories after 60 days without repository
activity, and only commits reset that timer — tags, issues and merged pull requests do not.
The snapshot job appends a row to the CSV every day, so it always has something to commit.

The commit identity comes from the optional repository variables `SNAPSHOT_AUTHOR_NAME` and
`SNAPSHOT_AUTHOR_EMAIL`. The push itself is made with the Actions token, so the commit is
authored by that identity while GitHub attributes the push to the workflow; a personal access
token would attribute both.

## License

MIT — see [LICENSE](LICENSE).

Not affiliated with UTE. Station data belongs to its publisher.
