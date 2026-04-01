# PRD: Telegram-to-Astro Research Agent
Version: 1.0
Owner: Dr. Chukwuma Onyeije
Status: Draft
Primary Environment: Local repo + GitHub + Railway + Codex
Primary Interface: Telegram bot
Primary Outputs: Digest, File, Summary, MDX Astro blog post

---

## 1. Purpose

Build a robust, file-backed, command-driven research ingestion system that accepts heterogeneous inputs from Telegram and converts them into structured outputs for review, archiving, and publishing.

The system must support:
- plain text
- webpage URLs
- research article links
- PubMed IDs / PubMed URLs
- YouTube transcript text or transcript-derived input
- spoken audio transcribed upstream (for example via Whisper or another transcription layer)

The system must respond to explicit commands such as:
- digest it
- file it
- summarize it
- create a full mdx astro blog

This is not a generic chatbot. It is a source-aware ingestion and rendering engine for physician-builder knowledge work.

---

## 2. Product Vision

Create a personal research operating system that allows the user to send content from mobile or desktop, convert it into a normalized internal representation, and route it into one of four deterministic output modes:

1. Digest
2. File
3. Summarize
4. MDX Astro Blog

The system should be trustworthy, source-aware, reproducible, and extensible.

---

## 3. Primary Use Cases

### Use Case A: Quick Digest
User sends:
`digest https://...`

System returns:
- concise high-signal summary
- why it matters
- optional physician-builder angle

### Use Case B: Archival Filing
User sends:
`file https://...`
or
`file PMID:12345678`

System returns:
- confirmation that source was archived
- saved metadata
- normalized text
- storage path or slug

### Use Case C: Structured Summary
User sends:
`summarize https://...`

System returns:
- structured summary
- key claims
- evidence
- limitations
- possible reuse in Doctors Who Code / CodeCraftMD / OpenMFM

### Use Case D: Full MDX Blog Draft
User sends:
`mdx https://...`

System returns and saves:
- frontmatter
- title
- subtitle or dek if needed
- publication-ready MDX draft
- section headings
- conclusion
- optional callout blocks
- optional “Why this matters for physician-builders” section

### Use Case E: Audio to Insight
User sends:
- audio note
- transcribed speech
- pasted transcript

System routes through:
- transcription layer if needed
- normalization
- command mode
- output renderer

---

## 4. Core Design Principle

All inputs must first be normalized into a shared internal object before any summarization or drafting occurs.

The system must never treat all sources as equivalent.

For example:
- a PubMed abstract is not the same as a full paper
- a YouTube transcript is not the same as a peer-reviewed article
- an audio transcription may contain uncertainty
- webpage extraction may be partial or noisy

The output must reflect what source material was actually available.

---

## 5. Functional Requirements

### 5.1 Input Adapters
The system must accept and process:
- Telegram text messages
- URLs
- PubMed IDs
- PubMed URLs
- pasted transcripts
- pasted article text
- transcribed audio text
- optional uploaded files in future versions

### 5.2 Intent Parsing
The system must detect and map user commands to one of the following modes:
- digest
- file
- summarize
- mdx

The system may support aliases, but internally everything must map to one of these four canonical modes.

### 5.3 Source Classification
The system must classify source type as one of:
- text
- webpage
- pubmed
- research_article
- transcript
- audio_transcript
- unknown

### 5.4 Normalization
The system must create a normalized internal record containing:
- source_type
- source_reference
- raw_input
- normalized_text
- title
- authors if available
- publication or platform if available
- date if available
- completeness flag
- requested_action
- tags
- created_at
- source hash or unique ID

### 5.5 Rendering
The system must render outputs using mode-specific templates:
- digest renderer
- file renderer
- summary renderer
- mdx renderer

### 5.6 Persistence
The system must save results to the repo and/or a connected persistence layer.
At minimum, save:
- metadata JSON
- normalized source text
- generated output

### 5.7 Telegram Response
The system must return a useful response to Telegram, including:
- the generated content
- or confirmation of archive path
- or an actionable error message

---

## 6. Non-Functional Requirements

### 6.1 Determinism
The system should prefer explicit mode-based workflows over vague conversational behavior.

### 6.2 Auditability
Every output must preserve provenance:
- original source reference
- timestamp
- command used
- model used
- completeness status

### 6.3 Extensibility
New adapters and renderers must be easy to add without rewriting core logic.

### 6.4 Reliability
The system must fail gracefully when:
- no URL is present
- extraction fails
- transcript is too short
- PubMed metadata is incomplete
- output exceeds Telegram response limits

### 6.5 File-First Architecture
The repo is the source of truth. Generated work must be saved in structured folders rather than existing only in chat responses.

---

## 7. Command Grammar

Canonical commands:

- `digest <input>`
- `file <input>`
- `summarize <input>`
- `mdx <input>`

Examples:
- `digest https://example.com/article`
- `file PMID:12345678`
- `summarize pasted transcript here`
- `mdx https://pubmed.ncbi.nlm.nih.gov/...`

Natural-language aliases may be supported, but canonical command parsing is preferred.

---

## 8. Output Definitions

### 8.1 Digest Output
Purpose:
Fast, high-signal synthesis.

Expected sections:
- Core takeaway
- 3 to 5 key points
- Why it matters
- Optional physician-builder angle

### 8.2 File Output
Purpose:
Archive source for future retrieval.

Expected artifacts:
- metadata JSON
- normalized source text
- short abstract or note
- storage path confirmation

### 8.3 Summary Output
Purpose:
Detailed structured understanding.

Expected sections:
- Overview
- Core claims
- Evidence and reasoning
- Limitations
- Practical implications
- Reuse opportunities

### 8.4 MDX Output
Purpose:
Create publishable Astro content.

Expected artifacts:
- `.mdx` file
- frontmatter
- title
- slug
- tags
- structured body
- conclusion
- optional CTA or framing section

---

## 9. Suggested Repo Structure

```text
research-agent/
  README.md
  PRD-research-agent.md
  package.json
  railway.json
  .env.example

  src/
    server.ts
    config.ts
    types.ts

    telegram/
      webhook.ts
      router.ts
      parseCommand.ts

    ingest/
      text.ts
      url.ts
      pubmed.ts
      transcript.ts
      audio.ts

    normalize/
      normalizeInput.ts
      buildRecord.ts

    actions/
      digest.ts
      file.ts
      summarize.ts
      mdx.ts

    render/
      markdown.ts
      mdx.ts
      telegram.ts
      json.ts

    storage/
      fs.ts
      github.ts
      slugify.ts
      hashes.ts

    llm/
      openai.ts
      prompts.ts

    utils/
      dates.ts
      logging.ts
      errors.ts

  prompts/
    digest.md
    file.md
    summarize.md
    mdx.md

  configs/
    modes.json
    taxonomy.json

  archive/
    records/
    sources/
    transcripts/
    summaries/

  content/
    blog/

  tests/