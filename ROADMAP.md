# Research Agent Roadmap

## Current Status

The Telegram-to-Astro research agent is live on Railway with:

- Telegram webhook routing
- Canonical commands: `digest`, `file`, `summarize`, `mdx`
- Postgres-backed canonical storage
- Webpage ingestion through readable extraction
- PubMed ingestion
- Telegram responses for working digest and archive flows
- Astro MDX draft generation scaffold
- GitHub draft-sync scaffold for curated publish outputs

## What Is Done

### Infrastructure

- GitHub repo initialized and connected to Railway
- Railway app service live
- Railway Postgres connected and healthy
- Telegram webhook configured
- OpenAI Responses API integration working

### Core Product

- Command parsing and routing
- Source classification
- Normalization into a shared record
- Canonical database persistence
- Local export artifacts
- Basic Telegram-safe reply chunking

### Stability Improvements

- Non-blocking app startup while database initializes
- Better startup logging
- Configurable OpenAI timeout
- Graceful URL-ingestion error handling for blocked sources

## Immediate Next Milestones

### Milestone 1: Reliability and UX

- Make Telegram responses shorter and cleaner for `file`
- Replace raw failure messages with intentional user guidance
- Add request-level logging and trace IDs
- Add lightweight retry behavior for transient fetch issues

### Milestone 2: YouTube and Transcript Ingestion

- Detect YouTube URLs explicitly
- Resolve video metadata
- Pull transcript text when available
- Handle missing transcripts gracefully
- Normalize transcript confidence and completeness
- Support pasted YouTube transcripts as fallback

### Milestone 3: Retrieval and Search

- Add search command for archived records
- Add retrieval by record ID, PMID, URL, tag, and date
- Add “latest filed items” and “show recent digests”
- Add physician-builder topic tagging and filtering

### Milestone 4: Better MDX Publishing

- Improve frontmatter quality
- Add better title/dek generation
- Add stronger Astro-ready section structures
- Add voice tuning for Doctors Who Code / OpenMFM / CodeCraftMD
- Make GitHub draft sync explicit for curated publish outputs

## YouTube Support Roadmap

### Phase A

- Classify YouTube URLs separately from generic webpages
- Return a good message when only metadata is available
- Accept pasted transcript text for immediate use

### Phase B

- Add transcript fetch adapter
- Save transcript provenance and completeness
- Support `digest`, `summarize`, and `mdx` directly from transcripts

### Phase C

- Add chapter-aware summarization
- Add speaker segmentation when available
- Add “clip to insight” workflow for selected timestamps

## Longer-Term Improvement Runway

- Add article/full-text adapters beyond PubMed abstracts
- Add PDF ingestion
- Add file upload handling
- Add source deduplication
- Add review queue for draft outputs
- Add curation states: inbox, filed, drafted, publish-ready
- Add automated GitHub draft PR workflow for curated MDX outputs
- Add searchable dashboard over Postgres records
- Add semantic retrieval over stored records

## Architectural Direction

- Online-first persistence remains the source of truth
- Local files remain export artifacts
- GitHub remains for draft publish and curated outputs
- All inputs continue to normalize before rendering
