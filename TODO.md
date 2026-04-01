# TODO

## Phase 2: Reliability and Telegram UX

- Shorten Telegram `file` responses while keeping the full archival note in storage
- Continue improving source-specific failure messages
- Add lightweight retries for transient webpage extraction failures
- Add request IDs or similar trace markers in logs
- Add health diagnostics that distinguish app health from dependency health

## Phase 3: YouTube and Transcript Ingestion

- Detect YouTube URLs explicitly
- Add YouTube metadata extraction
- Add transcript retrieval when available
- Add graceful fallback when transcript retrieval fails
- Support pasted transcripts as a first-class ingestion path
- Preserve transcript provenance and completeness in normalized records

## Phase 4: Retrieval and Search

- Add `search` command
- Add retrieval by canonical record ID
- Add retrieval by PMID
- Add retrieval by URL
- Add recent-items command
- Add topic-aware and date-aware filtering

## Phase 5: MDX Publishing and Curated Output

- Improve Astro frontmatter consistency
- Improve title and dek generation
- Improve article section structure
- Add stronger brand/voice tuning for physician-builder publishing
- Make curated GitHub draft sync explicit instead of implicit
- Add a promotion path from draft to curated publish output

## Phase 6: Advanced Ingestion and Expansion

- Add PDF ingestion
- Add file upload handling
- Add richer article/full-text adapters
- Add deduplication by source hash and canonical reference
- Add semantic retrieval over stored records
- Add dashboard or operator review interface
