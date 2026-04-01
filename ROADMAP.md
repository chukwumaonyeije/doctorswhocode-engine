# Research Agent Roadmap

## Current State

The Telegram-to-Astro research agent is live and functional in its first working form.

### Live and Working

- Railway app service is deployed and responding
- Railway Postgres is connected and acting as the canonical data store
- Telegram webhook routing is active
- OpenAI generation is active
- Canonical commands work:
  - `digest`
  - `file`
  - `summarize`
  - `mdx`
- Webpage ingestion works for accessible pages
- PubMed ingestion works
- Initial YouTube URL detection and transcript/metadata ingestion is in place
- Deep YouTube analysis is in place with local and hosted transcript fallbacks
- Blocked webpage extraction now returns more helpful user-facing errors
- Retrieval by record ID and recent-item listing is in place

### Core Architectural Rules Now In Place

- Online-first persistence is the source of truth
- Local files are export artifacts, not the canonical store
- GitHub is reserved for draft publish and curated outputs
- All inbound content is normalized before rendering

## Phase 1: Foundation and First Live Workflow

### Goal

Get the system online, stable, and capable of real end-to-end Telegram-driven research workflows.

### Status

Completed

### What Was Included

- GitHub repo initialized and connected to Railway
- Railway deployment working
- Postgres-backed canonical persistence
- Telegram bot webhook processing
- Shared input normalization model
- Command parsing and action routing
- Webpage and PubMed ingestion
- Digest, file, summarize, and MDX pipelines
- Initial Telegram-safe response handling

### Outcome

The app is now a real working product, not just a scaffold.

## Phase 2: Reliability and Telegram UX

### Goal

Make the bot feel dependable, intentional, and comfortable to use day to day.

### Status

In progress

### Focus Areas

- Shorter Telegram responses for `file`
- Cleaner user-facing error messages
- Better handling for blocked, restricted, or empty source pages
- Request-level observability in logs
- Timeouts and retries tuned for real usage

### Notes

Most of this phase is now functionally in place for a working beta. Remaining work is mostly polish rather than foundational reliability.

### Definition of Done

- Raw infrastructure errors rarely leak into Telegram
- `file` returns concise confirmations while full notes stay in storage
- Common failure cases point the user toward a useful fallback

## Phase 3: YouTube and Transcript Ingestion

### Goal

Make YouTube URLs and transcript-driven inputs first-class sources.

### Status

Substantially underway

### Focus Areas

- Explicit YouTube URL detection
- Video metadata extraction
- Transcript retrieval when available
- Graceful fallback when transcripts are unavailable
- Pasted transcript support
- Transcript provenance and completeness tracking
- Deep-analysis acknowledgement flow
- Hosted fallback providers for transcript acquisition

### Definition of Done

- User can send a YouTube URL and receive a meaningful response
- User can paste a transcript and route it through any canonical command
- Outputs clearly state whether they were based on transcript text, metadata only, or partial extraction

## Phase 4: Retrieval, Search, and Research Memory

### Goal

Make the archive genuinely useful after many records have accumulated.

### Status

Started

### Focus Areas

- Search archived records
- Retrieve by PMID, URL, record ID, tag, and date
- Show recent filings and recent digests
- Add topic-aware and physician-builder-aware filtering

### Notes

Record ID retrieval and recent-item listing are now implemented. Search and richer filters are the next retrieval milestone.

### Definition of Done

- Stored research can be found and reused quickly
- Filing creates durable retrieval value, not just storage

## Phase 5: MDX Publishing and Curated Output

### Goal

Turn stored research into cleaner, more publishable Astro-ready drafts.

### Status

Planned

### Focus Areas

- Better frontmatter generation
- Better title, dek, and section structure
- Stronger voice alignment for Doctors Who Code and related properties
- Explicit curated-output workflow
- GitHub draft-sync only for curated publish outputs
- MDX on demand from saved records
- PDF-on-demand export workflow

### Definition of Done

- `mdx` produces cleaner publish-ready drafts
- Curated outputs can be promoted into a more intentional publishing path

## Phase 6: Advanced Ingestion and Expansion

### Goal

Extend beyond URLs and abstracts into richer research sources and workflows.

### Status

Later runway

### Focus Areas

- PDF ingestion
- file upload handling
- richer article/full-text adapters
- source deduplication
- semantic retrieval over stored records
- review queue and curation states
- dashboard or operator interface over Postgres records

### Definition of Done

- The agent supports a broader set of physician-builder knowledge workflows without losing source awareness

## Immediate Next Priorities

### Priority Order

1. Add MDX on demand from saved analyses
2. Add PDF on demand from saved analyses
3. Expand retrieval into true search/filtering
4. Continue output/template tuning by source type

## Improvement Runway

### Near-Term

- Better Telegram ergonomics
- Better source-specific failure messaging
- YouTube ingestion
- transcript-first workflows

### Mid-Term

- retrieval and research memory
- stronger MDX quality
- curated publish flow

### Long-Term

- PDF and file uploads
- richer data model and retrieval
- dashboard and review workflow
