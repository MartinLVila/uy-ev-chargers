# Contributing

## Running it locally

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

`db:migrate` is not optional and has to run before anything reads or writes: the database starts
empty, and polling against an unmigrated schema fails without explaining why.

`.env.example` lists every variable and what it is for. A local database connection string is enough
to get the app running; the rest are only needed for the features that use them.

## Checks

```bash
npm test          # runs against an in-process database, no network needed
npm run typecheck
npm run lint
npm run build
```

All four run in CI on every pull request. `typecheck` carries type-level assertions that the test
run cannot catch on its own, so it is not redundant with `npm test`.
