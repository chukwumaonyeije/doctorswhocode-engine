# DoctorsWhoCode Engine V2
## Approved Scope Checklist

**Purpose:** Short approval checklist for Version 2 planning and eventual implementation.

**Rule of thumb:** Version 2 is approved only as an additive layer on top of Version 1. Nothing in this list may break, rename, or silently redefine Version 1 behavior.

---

## Approved

- Add a separate clinical note command family:
  - `/note`
  - `/note-voice`
  - `/note-status`
  - optional follow-on note lifecycle commands such as `/note-pdf`, `/note-review`, `/note-sign`
- Add additive schema support for:
  - `clinical_encounters`
  - `editorial_queue`
  - `app_settings`
  - `capture_type` on `research_records`
  - `record_domain` or equivalent clinical-vs-research discriminator
- Add editorial-intelligence commands that do not collide with V1:
  - `/schedule`
  - `/draft-score`
  - `/social`
  - `/weekly-digest`
  - `/alert-aging`
- Add `/capture [type] [content]` as a new wrapper command
- Add `POST /ingest/email` as an additive ingestion endpoint
- Add clinical guards so note records never appear in editorial retrieval or editorial queue flows
- Add a slash-command router layer ahead of the current V1 parser
- Add APSO `.docx` rendering for clinical notes
- Add Whisper-based voice transcription for note intake

---

## Not Approved Unless Explicitly Reworked

- Renaming `research_records` to `records`
- Assuming UUID record IDs for existing records
- Replacing the current `source_type` taxonomy outright
- Redefining `digest` to mean weekly editorial summary
- Introducing new logic that changes current `digest`, `file`, `summarize`, `mdx`, `pdf`, `recent`, `find`, `search`, or `queue` behavior by default
- Designing around non-existent V1 commands such as `/save`, `/pubmed`, or `/youtube`
- Letting clinical records leak into editorial queue or search results
- Replacing the current OpenAI integration globally as part of initial V2 work

---

## Mandatory Compatibility Decisions

- Use `research_records` as the base table for V2 record relationships
- Preserve text record IDs for V1 compatibility
- Keep `digest` as the Version 1 research-analysis command
- Use `weekly-digest` as the editorial summary command
- Keep current `source_type` values working for all existing records
- Use a separate discriminator like `record_domain = 'clinical' | 'research'`
- Route slash commands before the current natural-language parser
- Reject clinical records from all editorial-only commands

---

## Minimum Safe Build Order

1. Add additive schema changes only
2. Add slash-command routing layer
3. Add `/note` and `/note-voice`
4. Add clinical guardrails to editorial retrieval
5. Add `editorial_queue`
6. Add `/schedule`, `/draft-score`, and `/social`
7. Add `/weekly-digest` and `/alert-aging`
8. Add `/capture`
9. Add email ingestion

---

## Merge Gate

Version 2 work is not ready to merge unless all are true:

- [ ] All Version 1 commands still pass manual verification
- [ ] `digest` still means research digest
- [ ] Clinical records are excluded from `recent`, `find`, `search`, and `queue`
- [ ] No migration assumes a `records` table rename
- [ ] No migration assumes UUID IDs for old records
- [ ] New commands are slash-routed separately from the V1 parser
- [ ] New source or capture classifications do not break existing filters
- [ ] GitHub sync, MDX, PDF, and queue workflows still work for existing research records
