# DoctorsWhoCode Engine V2
## V1-Safe Implementation Spec

**Purpose:** Preserve the intent of the Version 2 PRD while ensuring that no Version 2 work breaks, redefines, or interferes with the current Version 1 engine.

**Status:** Planning document only. Do not implement until Version 1 priorities are complete.

**Compatibility principle:** Version 2 must be additive. It may extend the database, command surface, rendering outputs, and ingestion entrypoints, but it must not rename, repurpose, or silently alter Version 1 behavior.

---

## 1. V1 Compatibility Rules

The following rules are mandatory for all Version 2 work:

- Do not rename or replace the existing `research_records` table.
- Do not assume UUID record IDs. Version 1 uses text record IDs and Version 2 must interoperate with that.
- Do not redefine the existing `digest` command. In Version 1, `digest` is already a core research-analysis action.
- Do not replace the existing `sourceType` semantics used by Version 1 records.
- Do not allow clinical records to appear in editorial retrieval or editorial queue workflows.
- Do not break the current Telegram command parser for `digest`, `file`, `summarize`, `mdx`, `pdf`, `show`, `recent`, `find`, `search`, `queue`, `mark`, `promote`, `demote`, or natural-language routing.
- Route all new slash-prefixed Version 2 commands before current Version 1 editorial parsing.

---

## 2. Current V1 Constraints

Version 1 currently uses:

- Table: `research_records`
- Record ID type: `text`
- Current source types:
  - `text`
  - `webpage`
  - `pubmed`
  - `research_article`
  - `transcript`
  - `audio_transcript`
  - `unknown`
- Current core actions:
  - `digest`
  - `file`
  - `summarize`
  - `mdx`
- Existing editorial/retrieval features:
  - `pdf`
  - `show` / `retrieve`
  - `recent`
  - `find` / `search`
  - `queue`
  - curation status updates

Any Version 2 design must layer on top of these assumptions rather than replace them.

---

## 3. Schema Changes: V1-Safe Form

### 3.1 Do not alter V1 by renaming `research_records`

The Version 2 PRD refers to a `records` table. For compatibility, all Version 2 relational references must target the existing `research_records` table unless a later migration intentionally introduces a stable abstraction layer.

### 3.2 Do not replace existing `source_type` values

Version 1 already relies on `source_type` values for retrieval and filtering. Version 2 must not overwrite the current taxonomy with a new enum.

Instead, use one of these two safe patterns:

1. Extend `source_type` carefully by adding only new values that do not collide with existing ones.
2. Preferably add a second discriminator column such as `workflow_type` or `record_domain`.

Recommended safe option:

```sql
ALTER TABLE research_records
ADD COLUMN IF NOT EXISTS record_domain TEXT NOT NULL DEFAULT 'research'
CHECK (record_domain IN ('research', 'clinical'));
```

This allows clinical and editorial guards without breaking current `source_type` filters.

### 3.3 Add `capture_type`

This is safe as an additive change:

```sql
ALTER TABLE research_records
ADD COLUMN IF NOT EXISTS capture_type TEXT NOT NULL DEFAULT 'untagged';
```

Allowed values should be enforced at the application layer first to avoid fragile early migrations.

### 3.4 Create `clinical_encounters`

This is safe if it references the actual Version 1 table and ID type:

```sql
CREATE TABLE IF NOT EXISTS clinical_encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id TEXT NOT NULL REFERENCES research_records(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  patient_identifier TEXT NOT NULL,
  gestational_age TEXT,
  encounter_date DATE,
  encounter_type TEXT CHECK (encounter_type IN ('outpatient', 'inpatient', 'consultation')),

  assessment JSONB,
  plan JSONB,
  subjective JSONB,
  objective JSONB,

  raw_transcript TEXT,
  apso_docx_path TEXT,
  apso_pdf_path TEXT,
  note_status TEXT DEFAULT 'draft'
    CHECK (note_status IN ('draft', 'reviewed', 'signed', 'archived'))
);
```

### 3.5 Create `editorial_queue`

This is safe as additive infrastructure:

```sql
CREATE TABLE IF NOT EXISTS editorial_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id TEXT NOT NULL REFERENCES research_records(id) ON DELETE CASCADE,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  scheduled_publish_date DATE,
  status TEXT DEFAULT 'queued'
    CHECK (status IN ('queued', 'in_progress', 'scheduled', 'published', 'archived')),
  draft_score INTEGER CHECK (draft_score BETWEEN 1 AND 5),
  destinations TEXT[] DEFAULT ARRAY['blog'],
  notes TEXT
);
```

### 3.6 Add settings table

This is needed for the aging alert threshold and is safe:

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Clinical Commands: V1-Safe Routing

All clinical commands must be handled before the existing Version 1 parser in order to avoid accidental interpretation as editorial or research commands.

New command family:

- `/note [transcript]`
- `/note-voice`
- `/note-status [record-id]`
- `/note-pdf [record-id]`
- `/note-review [record-id]`
- `/note-sign [record-id]`

### 4.1 `/note [transcript]`

Preserve the original PRD intent with these compatibility adjustments:

- Insert a row into `research_records`
- Set `record_domain = 'clinical'`
- Use a safe `source_type` value such as `transcript` rather than replacing the Version 1 taxonomy
- Store clinical-encounter-specific structure in `clinical_encounters`
- Do not add the record to editorial queue workflows

Recommended V1-safe metadata shape on the base record:

- `record_domain = 'clinical'`
- `source_type = 'transcript'`
- `metadata.workflow = 'note'`
- `metadata.noteKind = 'apso_consult'`

### 4.2 `/note-voice`

Safe if implemented as:

- Telegram voice download
- Whisper transcription
- Same processing pipeline as `/note`
- Base record stored in `research_records`
- Structured note stored in `clinical_encounters`

### 4.3 `/note-status`

Safe and isolated because it reads from `clinical_encounters` rather than editorial queues.

### 4.4 Clinical retrieval guard

This guard is required:

- `recent`
- `find`
- `search`
- `queue`
- scheduling
- social rendering
- draft scoring
- weekly editorial summaries

All editorial retrieval queries must exclude:

- `record_domain = 'clinical'`

If `record_domain` is not added, then fall back to:

- `metadata.workflow != 'note'`

---

## 5. Editorial Intelligence Commands: V1-Safe Names

### 5.1 Do not redefine `digest`

The Version 2 PRD currently reuses `/digest` for a weekly editorial summary. That is not compatible with Version 1.

Use one of these instead:

- `/weekly-digest`
- `/editorial-digest`
- `/queue-digest`

Recommended command: `/weekly-digest`

### 5.2 `/schedule [record-id] [YYYY-MM-DD]`

Safe if it:

- rejects clinical records
- uses `editorial_queue`
- updates GitHub frontmatter only when a GitHub-synced MDX draft exists
- never mutates the stored analysis output itself

### 5.3 `/draft-score [record-id]`

Safe if it:

- rejects clinical records
- reads saved MDX output from the canonical store or synced draft artifact
- writes only to `editorial_queue.draft_score`
- does not modify the underlying record unless explicitly requested in a later workflow

### 5.4 `/social [record-id] [platform]`

Safe if it:

- rejects clinical records
- reads from stored analysis or saved MDX draft
- remains output-only and does not auto-publish

### 5.5 `/weekly-digest`

Safe if it:

- operates only on editorial records
- ignores clinical records entirely
- calculates queue aging using `editorial_queue`
- uses a configurable threshold from `app_settings`

### 5.6 `/alert-aging [days]`

Safe as a settings update command.

---

## 6. Capture Expansions: V1-Safe Form

The Version 2 PRD references commands such as `/save`, `/pubmed`, and `/youtube`, but Version 1 does not expose those as canonical commands.

For compatibility, capture typing must integrate with existing Version 1 inputs instead.

### 6.1 `/capture [type] [content]`

This can be added safely as a new explicit wrapper command.

Behavior:

- parse capture type
- run the content through the existing V1 ingestion pipeline
- persist the base record normally
- set `capture_type`

### 6.2 Optional `--type` support

If later added, apply `--type` only to existing commands that already exist in V1:

- `digest`
- `file`
- `summarize`
- `mdx`

Do not design around non-existent V1 command names.

### 6.3 Retrieval filtering

`find` / `search` may later support:

- `--type [capture_type]`

This is safe as a filter extension.

---

## 7. Email Ingestion: V1-Safe Form

The V2 email webhook is safe if it is additive:

- Add `POST /ingest/email`
- Normalize payload from Postmark or Cloudmailin
- Strip HTML to text
- Route through the existing ingestion pipeline
- Store in `research_records`
- Set `source_type` to a safe existing or additive value
- Set `capture_type = 'untagged'`
- Send Telegram notification with record ID

Recommended safe storage shape:

- `record_domain = 'research'`
- `source_type = 'text'` or a newly added additive value `email`
- `metadata.ingestionChannel = 'email'`
- `metadata.emailSubject = ...`
- `metadata.emailFrom = ...`

If `source_type = 'email'` is added, update any source-type validators in Version 1 before using it.

---

## 8. Guard Layer

Create a shared guard utility and call it at the top of all editorial-only handlers.

Recommended V1-safe form:

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

This should be used by:

- schedule
- draft-score
- social
- weekly-digest
- queue views
- queue promotion and curation flows added in V2

---

## 9. Parser and Routing Strategy

Version 2 should not be bolted into the current natural-language parser first. It should use an explicit pre-parser for slash commands.

Recommended routing order:

1. Telegram message arrives
2. Detect slash-prefixed command family
3. Route `/note*`, `/schedule`, `/draft-score`, `/social`, `/weekly-digest`, `/alert-aging`, `/capture`
4. If no slash command matches, fall back to the current Version 1 parser

This prevents accidental collisions with Version 1 command inference.

---

## 10. File and Module Additions

These additions are safe if adapted to the current repo layout:

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

Adjust folder names to match the current repo conventions:

- `ingest/` not `ingestion/`
- `render/` not `rendering/`
- `storage/` and existing DB helpers, not a brand-new `db/` module root unless intentionally introduced

---

## 11. Model and Dependency Notes

These are generally safe:

- `docx`
- `openai` official SDK if introduced intentionally
- Whisper transcription through OpenAI

But Version 1 currently uses a custom OpenAI integration and default model configuration. Any SDK migration must avoid breaking:

- current timeout behavior
- current API key configuration
- existing `generateActionOutput` flows

Recommended approach:

- add a narrowly scoped OpenAI client helper for V2 note-generation and transcription
- do not replace the existing V1 OpenAI client until that migration is explicitly planned

---

## 12. Recommended Implementation Order

To keep Version 1 stable, implement Version 2 in this order:

1. Add additive schema changes only
2. Add slash-command router layer
3. Add clinical note pipeline and guards
4. Exclude clinical records from all editorial retrieval
5. Add editorial queue table and scheduling
6. Add draft scoring and social rendering
7. Add weekly editorial digest and aging alerts
8. Add capture typing
9. Add email ingestion

This order isolates risk and prevents half-built clinical records from leaking into editorial views.

---

## 13. Acceptance Criteria: V1-Safe Version

Before any Version 2 branch is considered safe to merge, verify:

- [ ] All existing Version 1 commands still behave exactly as before
- [ ] `digest` still performs research analysis and has not been repurposed
- [ ] Existing research records still appear correctly in `recent`, `find`, `search`, and `queue`
- [ ] Clinical note records are excluded from all editorial retrieval and scheduling workflows
- [ ] New clinical commands work without changing Version 1 command parsing
- [ ] Schema migrations run against `research_records` without requiring a table rename
- [ ] No code path assumes UUID record IDs for existing Version 1 records
- [ ] New source or capture classifications do not break current source-type filters
- [ ] Weekly editorial summaries use a new command name and do not collide with `digest`
- [ ] GitHub sync, MDX generation, PDF export, and current queue flows remain intact for Version 1 records

---

## 14. Bottom Line

Version 2 is compatible with Version 1 only if it is implemented as an additive layer.

The main changes needed from the original PRD are:

- target `research_records`, not `records`
- preserve text record IDs
- do not redefine `digest`
- do not replace the current `source_type` taxonomy
- introduce a separate clinical/editorial discriminator
- route new slash commands before the Version 1 parser

With those changes, Version 2 can be built later without destabilizing the current engine.
