# TODO

## Phase 2: Reliability and Telegram UX

- Continue tightening source-specific failure messages in lower-frequency ingestion paths
- Add richer operational diagnostics beyond request IDs and source counters
- Continue refining Telegram UX for long outputs and edge-case responses

## Phase 3: YouTube and Transcript Workflows

- Continue refining pasted transcript handling and edge-case detection
- Keep refining transcript provenance and completeness messaging, especially in harder fallback cases
- Improve user-facing fallback messaging when transcript retrieval is partial or unavailable
- Continue tuning deep YouTube output formatting against real examples

## Phase 4: Retrieval, Search, and Research Memory

- Refine search ranking and tune relevance weights against real usage
- Extend queue prioritization beyond the first sort modes
- Add more expressive research-memory workflows beyond list/search retrieval
- Continue refining source-reference normalization for harder equivalent-URL cases

## Phase 5: MDX Publishing and Curated Output

- Improve Astro frontmatter consistency and richer publish metadata
- Add stronger brand and voice tuning for physician-builder publishing
- Make curated GitHub draft sync more explicit in the workflow
- Add a clearer promotion path from draft to curated publish output

## Phase 6: Advanced Ingestion and Expansion

- Add PDF ingestion
- Add file upload handling
- Add richer article and full-text adapters
- Add deduplication by source hash and canonical reference
- Add semantic retrieval over stored records
- Add dashboard or operator review interface
