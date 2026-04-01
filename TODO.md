# TODO

## Near Term

- Shorten Telegram `file` responses while keeping the full archival note in storage
- Add clearer Telegram messages for blocked and restricted webpage sources
- Confirm and stabilize `digest` on a wider sample of webpages
- Add explicit YouTube URL detection
- Add transcript ingestion pathway for YouTube and pasted transcripts

## Next Product Features

- Add `search` and `retrieve` commands
- Add record lookup by PMID, URL, and canonical record ID
- Improve MDX prompt and output structure
- Add explicit curated GitHub draft-sync toggle
- Add domain-specific prompt tuning for physician-builder content

## Reliability

- Add retries for transient source fetch failures
- Add request IDs in logs
- Add health detail endpoint for database/OpenAI diagnostics
- Add tests for command parsing, source classification, and ingestion

## Publishing

- Improve Astro frontmatter consistency
- Add publication-ready slug review
- Add optional CTA and framing blocks by brand target
- Add workflow for promoting draft MDX to curated publish status
