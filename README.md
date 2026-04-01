# Telegram-to-Astro Research Agent

Online-first research ingestion system for Telegram-driven physician-builder workflows.

## What it does

This service accepts Telegram commands such as:

- `digest <input>`
- `file <input>`
- `summarize <input>`
- `mdx <input>`

Supported inputs in v1:

- Plain text
- Webpage URLs
- PubMed IDs
- PubMed URLs
- Pasted transcripts
- Upstream audio transcripts

## Architecture

All inbound content is normalized before any rendering occurs.

Pipeline:

1. Telegram webhook receives a message
2. Command parser resolves the canonical action
3. Source classifier chooses the correct ingestion adapter
4. Normalizer creates a provenance-aware record
5. Action renderer produces digest, archive note, summary, or MDX
6. Canonical records are persisted to Postgres
7. Optional export artifacts are written to files and draft-sync targets
8. Telegram reply returns a concise result or archive confirmation

## Local development

1. Copy `.env.example` to `.env`
2. Set `TELEGRAM_BOT_TOKEN`
3. Set `OPENAI_API_KEY`
4. Set `DATABASE_URL`
5. Optionally set `OPENAI_MODEL`, `OPENAI_TIMEOUT_MS`, `SUPADATA_API_KEY`, `FETCHTRANSCRIPT_API_KEY`, `PORT`, `GITHUB_TOKEN`, `GITHUB_REPO`, and `GITHUB_BRANCH`
6. Install dependencies with `npm install`
7. Run `npm run dev`

## HTTP endpoints

- `GET /health`
- `POST /telegram/webhook`
- `POST /ingest`

`/ingest` is a local debugging endpoint that accepts:

```json
{
  "text": "digest https://example.com/article"
}
```

## Canonical storage

Canonical records live in Postgres. Local files are exports, not the source of truth.

## Export outputs

- `archive/records/*.json`
- `archive/sources/*.md`
- `archive/summaries/*.md`
- `archive/transcripts/*.md`
- `content/blog/*.mdx`

## Notes

- URL extraction uses `r.jina.ai` for readable webpage text.
- PubMed extraction uses NCBI E-utilities.
- Telegram responses are chunked to respect message size constraints.
- Postgres is the online source of truth for ingestion records and rendered outputs.
- GitHub sync is reserved for draft publish/curated outputs.
