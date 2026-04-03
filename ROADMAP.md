# Research Agent Roadmap

## Current State

DoctorsWhoCode Engine is now beyond the initial beta scaffold stage.

The core Telegram-to-research pipeline is live, storage-backed, and capable of ingesting, analyzing, retrieving, drafting, exporting, and routing records through an editorial workflow.

### Live and Working

- Railway app service is deployed and responding
- Railway Postgres is the canonical store
- Telegram webhook routing is active
- OpenAI generation is active
- Canonical commands work:
  - `digest`
  - `file`
  - `summarize`
  - `mdx`
  - `pdf`
- Webpage ingestion works for accessible pages
- PubMed ingestion works
- YouTube URL detection is in place
- Transcript-aware YouTube analysis is in place with deep-analysis handling
- Retrieval by record ID is in place
- Retrieval by PMID and URL is in place
- Recent-item listing is in place
- Search across stored records is in place
- Date-aware and topic-aware filtering is in place
- Search ranking has moved beyond simple recency ordering
- Editorial queue views are in place
- Queue filtering by topic and date is in place
- Curation status updates are in place
- MDX on demand from saved records is in place
- MDX prompt and renderer quality improvements are in place for stronger titles, deks, tags, and body cleanup
- PDF on demand from saved records is in place
- GitHub draft sync for MDX outputs is in place

### Core Architectural Rules In Place

- Online-first persistence is the source of truth
- Local files are export artifacts, not the canonical store
- GitHub is reserved for draft publish and curated outputs
- All inbound content is normalized before rendering
- Source completeness and provenance shape downstream output

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

The app became a working product rather than a prototype scaffold.

## Phase 2: Reliability and Telegram UX

### Goal

Make the bot feel dependable, intentional, and comfortable to use day to day.

### Status

Mostly complete, with polish remaining

### What Is Already In Place

- Cleaner user-facing errors for blocked or empty sources
- Telegram-safe reply rendering and chunking
- Better source-aware fallback behavior
- Concise `file` confirmations while full notes remain in storage
- Lightweight retries for transient webpage extraction failures
- Health diagnostics that separate app readiness from dependency readiness
- Request/event logging throughout the main workflow with request-level trace markers
- Per-source success/failure counter events in logs
- Better source-specific failure messaging for webpage, PubMed, and YouTube fallback paths

### Remaining Work

- Richer observability beyond request IDs and first-pass source counters
- More source-specific polish in less-common ingestion paths
- Continued Telegram UX refinement for edge cases and long outputs

### Definition of Done

- Raw infrastructure errors rarely leak into Telegram
- `file` returns concise confirmations while full notes stay in storage
- Common failure cases point the user toward a useful fallback

## Phase 3: YouTube and Transcript Ingestion

### Goal

Make YouTube URLs and transcript-driven inputs first-class sources.

### Status

Substantially complete in first production form

### What Is Already In Place

- Explicit YouTube URL detection
- Video metadata extraction
- Transcript-first analysis where available
- Pasted transcript ingestion as a clearer first-class source path
- Deep-analysis acknowledgement flow
- Hosted and local transcript fallback paths
- Transcript-backed normalization and downstream analysis
- User-visible transcript provenance and completeness context in digest and summary outputs
- Deep YouTube Telegram replies condensed into more readable section-based summaries

### Remaining Work

- Further refinement of pasted-transcript-first workflows
- Further refinement of transcript provenance and completeness messaging in user-facing outputs
- More resilient handling for missing or partial transcript scenarios

### Definition of Done

- User can send a YouTube URL and receive a meaningful source-aware response
- User can paste a transcript and route it through canonical workflows
- Outputs clearly state whether they are based on transcript text, metadata only, or partial extraction

## Phase 4: Retrieval, Search, and Research Memory

### Goal

Make the archive genuinely useful after many records have accumulated.

### Status

Core retrieval layer implemented; refinement now underway

### What Is Already In Place

- Retrieve by record ID
- Retrieve by PMID and URL
- Source-reference normalization for equivalent PMID, PubMed URL, YouTube URL, and tracked web URL variants
- Recent-item listing
- Search across stored records
- Source-type filtering
- Curation-status filtering
- Topic-aware filtering
- Date-aware filtering
- Search relevance ranking beyond simple recency ordering
- Editorial queue views over stored records
- Queue filtering by topic and date
- Queue sorting by priority, oldest, and newest

### Next Retrieval Milestones

- Better ranking refinement and tuning
- Richer research-memory workflows rather than simple list/search output
- Editorial prioritization refinement beyond the first queue sort modes

### Definition of Done

- Stored research can be found and reused quickly
- Filing creates durable retrieval value, not just storage
- Queue and search become practical editorial tools, not just inspection utilities

## Phase 5: MDX Publishing and Curated Output

### Goal

Turn stored research into cleaner, more publishable Astro-ready drafts.

### Status

Partially implemented and now moving into quality refinement

### What Is Already In Place

- MDX generation from saved records
- Improved MDX title, dek, tag, and body cleanup behavior
- GitHub draft sync for MDX outputs
- Compound analyze-and-draft workflow
- Editorial queue states for draft promotion
- PDF export from saved records

### Remaining Work

- Better frontmatter consistency and richer publish metadata
- Stronger Doctors Who Code and physician-builder voice alignment
- More explicit curated-output workflow
- Clear promotion path from draft output to curated publish output

### Definition of Done

- `mdx` produces cleaner publish-ready drafts
- Drafts move through a more intentional editorial pipeline
- Curated outputs can be promoted into a deliberate publishing path

## Phase 6: Advanced Ingestion and Expansion

### Goal

Extend beyond URLs and abstracts into richer research sources and workflows.

### Status

Open runway

### Focus Areas

- PDF ingestion
- File upload handling
- Richer article and full-text adapters
- Source deduplication
- Semantic retrieval over stored records
- Review queue intelligence
- Dashboard or operator interface over Postgres records

### Definition of Done

- The agent supports a broader set of physician-builder knowledge workflows without losing source awareness

## Immediate Next Priorities

### Priority Order

1. Refine MDX quality and publishing structure
2. Finish Phase 2 polish on Telegram ergonomics and diagnostics
3. Continue retrieval refinement and editorial prioritization
4. Strengthen transcript provenance and transcript-first workflows
5. Begin PDF ingestion and richer file-based ingestion

## Improvement Runway

### Near-Term

- Better Telegram ergonomics
- Better observability and operational diagnostics
- Better search and queue prioritization
- Stronger MDX voice and structure

### Mid-Term

- Curated publishing workflow
- Transcript-first and source-provenance refinement
- Retrieval ranking and richer memory workflows

### Long-Term

- PDF and file uploads
- Deduplication and semantic retrieval
- Dashboard and review workflow
