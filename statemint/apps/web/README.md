# Statemint — Web

The Next.js dashboard for Statemint: upload a Nigerian bank statement PDF,
get auto-categorized transactions and spending analytics, ask questions
about your statement, and estimate your Nigerian personal income tax.

## Running locally

This app talks to the Statemint API (`../api`). Start the full stack from
the repo root first:

```bash
docker compose up -d
```

Then, from this directory:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Set `NEXT_PUBLIC_API_URL` (see `.env.example` at the repo root) if the API
isn't running at the default `http://localhost:4000/api`.
