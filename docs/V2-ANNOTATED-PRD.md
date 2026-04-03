# DoctorsWhoCode Engine V2
## Annotated PRD for V1 Compatibility

**Purpose:** Preserve the original V2 PRD while marking the exact changes required so Version 2 does not break or interfere with Version 1.

**Legend**

- `KEEP` = can be implemented as written or nearly as written
- `MODIFY` = keep the intent, but change the implementation details
- `RENAME` = feature is valid, but the command or identifier must change
- `DEFER` = do not implement this as part of the first V2 pass

---

## Original Context

> The DoctorsWhoCode Engine V1 is a working Telegram-driven research pipeline. It accepts URLs, PubMed IDs, and YouTube links; analyzes them via OpenAI; stores records in Postgres; and delivers MDX drafts, PDFs, and GitHub-synced outputs back to Telegram.

`KEEP`

This accurately describes the current repo direction.

> V2 extends the engine in two directions:
> 1. Clinical documentation
> 2. Editorial intelligence

`KEEP`

These are additive and form a clean strategic boundary for V2.

---

## Part 1 — Database Schema Changes

### 1.1 Add `source_type` to existing records table

Original:

```sql
ALTER TABLE records
ADD COLUMN source_type TEXT NOT NULL DEFAULT 'research'
CHECK (source_type IN ('web', 'pubmed', 'youtube', 'clinical_encounter', 'voice', 'email'));
```

`MODIFY`

Why:

- V1 already has `source_type`
- the live table is `research_records`, not `records`
- V1 already depends on existing values like `webpage`, `transcript`, and `audio_transcript`
- replacing the enum would break V1 filters and assumptions

V1-safe replacement:

```sql
ALTER TABLE research_records
ADD COLUMN IF NOT EXISTS record_domain TEXT NOT NULL DEFAULT 'research'
CHECK (record_domain IN ('research', 'clinical'));
```

Optional later extension:

- add `email` as a new additive `source_type` only after updating validators

### 1.2 Create `clinical_encounters` table

Original intent:

- separate structured APSO data from the base record

`KEEP`, with one required modification

Required change:

- `record_id` must reference `research_records(id)`
- `record_id` must be `TEXT`, not UUID, to match current V1 records

V1-safe form:

```sql
record_id TEXT NOT NULL REFERENCES research_records(id) ON DELETE CASCADE
```

### 1.3 Create `editorial_queue` table

`KEEP`, with one required modification

Required change:

- `record_id` must reference `research_records(id)` as `TEXT`

This table is additive and safe.

---

## Part 2 — Clinical Note Commands

### `/note [transcript]`

`KEEP`, with implementation adjustments

What stays:

- `/note` is a good isolated namespace
- transcript should be treated as clinical unconditionally if `/note` is used
- APSO JSON generation and validation are valid
- `.docx` rendering is valid
- Telegram document return is valid

What changes:

- insert into `research_records`, not `records`
- set `record_domain = 'clinical'`
- do not replace V1 `source_type` semantics
- recommended base record shape:
  - `source_type = 'transcript'`
  - `metadata.workflow = 'note'`
  - `metadata.noteKind = 'apso_consult'`

Compatibility note:

- this command must be routed before the existing V1 parser

### `/note-voice`

`KEEP`

This is additive and safe if it feeds the same `/note` pipeline after transcription.

Compatibility note:

- use a V2-scoped OpenAI helper for Whisper rather than replacing the V1 OpenAI layer globally

### `/note-status [record-id]`

`KEEP`

Safe because it is read-oriented and clinical-only.

### APSO document structure

`KEEP`

This does not conflict with V1.

### MFM APSO system prompt

`KEEP`

Safe and self-contained.

---

## Part 3 — Editorial Intelligence Commands

### `/schedule [record-id] [YYYY-MM-DD]`

`KEEP`

Safe if:

- it rejects clinical records
- it upserts into `editorial_queue`
- it only patches frontmatter when a GitHub-synced MDX draft exists

### `/draft-score [record-id]`

`KEEP`

Safe if:

- it rejects clinical records
- it reads from stored analysis or stored MDX
- it stores only the score and notes in V2 queue infrastructure

### `/social [record-id] [platform]`

`KEEP`

Safe if:

- it rejects clinical records
- it is output-only
- it does not auto-publish

### `/digest` as weekly editorial velocity summary

`RENAME`

Why:

- `digest` is already a live V1 research-analysis command
- redefining it would directly interfere with Version 1

Approved replacement:

- `/weekly-digest`

Alternative acceptable names:

- `/editorial-digest`
- `/queue-digest`

Recommended:

- `/weekly-digest`

### `/alert-aging [days]`

`KEEP`

Safe as an additive settings command using an `app_settings` table.

---

## Part 4 — Capture Expansions

### `/capture [type] [content]`

`KEEP`

Safe as a new wrapper command that feeds the current ingestion pipeline and adds `capture_type`.

Required schema addition:

```sql
ALTER TABLE research_records
ADD COLUMN IF NOT EXISTS capture_type TEXT NOT NULL DEFAULT 'untagged';
```

### “All existing ingestion commands (`/save`, `/pubmed`, `/youtube`) should accept an optional `--type` flag.”

`MODIFY`

Why:

- those are not the current V1 canonical commands

V1-safe revision:

- if `--type` is added later, apply it to existing V1 commands:
  - `digest`
  - `file`
  - `summarize`
  - `mdx`

### “`/find` and `/search` should accept `--type [type]`”

`MODIFY`

Why:

- V1 uses `find` / `search` without slash as part of the current parser style

V1-safe revision:

- extend the existing retrieval parser to support `find ... --type X` and `search ... --type X`
- do not force a slash-command version unless intentionally introducing one

---

## Part 5 — Email Ingestion Endpoint

### `POST /ingest/email`

`KEEP`

Safe as an additive endpoint.

Required adjustments:

- store into `research_records`
- preserve current V1 normalization flow
- use:
  - `record_domain = 'research'`
  - `capture_type = 'untagged'`
- use either:
  - existing `source_type = 'text'` plus metadata markers
  - or additive `source_type = 'email'` after validator updates

Recommended metadata:

- `metadata.ingestionChannel = 'email'`
- `metadata.emailSubject = subject`
- `metadata.emailFrom = from`

---

## Part 6 — File Structure Additions

Original proposed folders included:

- `commands/`
- `ingestion/`
- `rendering/`
- `db/`

`MODIFY`

Why:

- current repo conventions already use:
  - `src/ingest`
  - `src/render`
  - `src/storage`

V1-safe adaptation:

```text
src/
  commands/
    note.ts
    noteStatus.ts
    notePdf.ts
    noteReview.ts
    noteSign.ts
    schedule.ts
    draftScore.ts
    social.ts
    weeklyDigest.ts
    alertAging.ts
    capture.ts
  ingest/
    emailWebhook.ts
    whisper.ts
  render/
    apsoDocx.ts
  storage/
    guards.ts
  prompts/
    mfmApso.ts
    draftScore.ts
    social.ts
  database/
    migrations/
      002_v2_schema.sql
```

---

## Part 7 — Dependencies and Models

### `docx`

`KEEP`

Safe for APSO output generation.

### `openai` official SDK

`MODIFY`

Why:

- current V1 logic already has a custom OpenAI integration
- replacing it globally during early V2 work would increase risk

V1-safe revision:

- allow a narrow V2-specific helper for APSO generation and Whisper
- do not migrate all V1 generation paths as part of V2 phase 1

### Model assignments

`KEEP`, with one implementation note

Model choices are fine if they are scoped to the new V2 features and do not silently change V1 defaults.

---

## Part 8 — Guard Implementation

Original guard intent:

- clinical records must never enter editorial commands

`KEEP`, but modify to match V1-compatible storage

V1-safe idea:

```ts
export function assertNotClinical(record: {
  metadata?: Record<string, unknown>;
  recordDomain?: string;
}): void {
  const workflow = typeof record.metadata?.workflow === "string" ? record.metadata.workflow : "";
  if (record.recordDomain === "clinical" || workflow === "note") {
    throw new Error(
      "Clinical records cannot be used with editorial commands. Use /note-status [id] to check note status."
    );
  }
}
```

Apply this guard to:

- schedule
- draft-score
- social
- weekly-digest
- queue views
- any future editorial promotion flow

---

## Part 9 — Acceptance Criteria

Most of the original acceptance criteria are good.

`MODIFY` the following items:

- Replace `/digest` editorial-summary acceptance with `/weekly-digest`
- Replace `records` references with `research_records`
- Add explicit V1 regression criteria:
  - `digest` still works as research digest
  - old records remain searchable
  - queue behavior remains intact for research records
  - no path assumes UUID IDs for legacy records

---

## Final Approved Interpretation

The Version 2 PRD is approved in principle with these exact compatibility edits:

1. Use `research_records`, not `records`
2. Preserve text record IDs
3. Add `record_domain` instead of redefining `source_type`
4. Keep `/digest` for Version 1 research use
5. Rename the V2 weekly summary command to `/weekly-digest`
6. Route new slash commands before the current V1 parser
7. Exclude clinical records from all editorial retrieval and editorial workflows
8. Adapt new flags and ingestion references to the actual Version 1 command surface

With those edits, Version 2 remains aligned with your original vision while staying safe for the live Version 1 engine.
