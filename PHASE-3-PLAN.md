# Phase 3 Plan: Intent, YouTube, and Knowledge Extraction

## Purpose

Phase 3 expands DWC Engine from a reliable command-driven ingestion tool into a more context-aware physician-developer research assistant.

This phase is driven by the gap between:

- what DWC Engine currently does well
- what Manus demonstrated in output richness, contextual understanding, and artifact usefulness

The goal is not to abandon DWC Engine’s architecture. The goal is to preserve its normalization-first, source-aware design while upgrading the intelligence and usefulness of the outputs.

## Current State

DWC Engine already supports:

- `digest`
- `file`
- `summarize`
- `mdx`
- webpage ingestion
- PubMed ingestion
- initial YouTube ingestion
- Postgres-backed canonical storage
- Telegram delivery

Current limitations:

- commands are still too rigid
- outputs are structurally useful but not yet project-aware enough
- follow-up intent is weak
- there is no “critical flags” layer
- there is no reusable knowledge-artifact mode beyond current archive and MDX outputs

## Phase 3 Objectives

### Objective 1

Allow natural-language requests to map to canonical or derived workflows.

### Objective 2

Make output templates more source-aware and more decision-oriented.

### Objective 3

Add explicit “critical flags” extraction for physician-developer and system-design relevance.

### Objective 4

Create reusable knowledge artifacts from sources, especially video and project-planning inputs.

### Objective 5

Improve YouTube support so it is useful even when only metadata is available.

## Phase 3A: Intent Detection Upgrade

### Goal

Let the user speak naturally without losing deterministic routing.

### What to Build

- Add an intent parsing layer before canonical command parsing
- Support requests like:
  - “Extract useful information from this video for the DWC engine”
  - “What matters here for physician developers?”
  - “Turn this into a knowledge note”
  - “What are the risks?”
  - “Make this into a blog post”
- Map natural-language requests into:
  - existing canonical modes
  - or new derived modes

### Candidate Derived Modes

- `extract`
- `flags`
- `knowledge_note`
- `project_brief`
- `decision_memo`

### Acceptance Criteria

- User no longer needs to begin with `digest`, `file`, `summarize`, or `mdx`
- System still maps requests into deterministic internal actions
- Telegram experience feels more natural without becoming a vague chatbot

## Phase 3B: Source-Aware Output Templates

### Goal

Match the output structure to the source type and user intent.

### What to Build

#### For YouTube and project-analysis sources

- What this is
- Core finding
- What’s in the source
- Critical flags
- Practical implications
- Recommended next step

#### For PubMed and research articles

- Core takeaway
- Key findings
- Evidence and reasoning
- Limitations
- Why it matters
- Physician-builder angle when relevant

#### For implementation and system-planning inputs

- What this is
- Core recommendation
- Architectural implications
- Risks and cautions
- Actionable next steps

### Acceptance Criteria

- Output feels tailored to source type
- Output is more actionable, not just descriptive
- Output preserves explicit completeness and provenance

## Phase 3C: Critical Flags Layer

### Goal

Add a structured caution-and-risk section that is especially useful for physician-developer work.

### What to Build

Extract and render:

- HIPAA and compliance risks
- security and privacy concerns
- unsupported assumptions
- missing evidence
- architectural fragility
- vendor lock-in risk
- maintainability concerns
- operational complexity traps

### Acceptance Criteria

- DWC can explicitly surface critical risks rather than leaving them implicit
- Flags feel relevant to the source and project context
- This layer is reusable across digest, summary, and project-oriented outputs

## Phase 3D: Knowledge Artifact Generation

### Goal

Produce reusable, storable artifacts beyond standard chat replies.

### What to Build

- `knowledge_note`
- `project_brief`
- `decision_memo`
- `video_extract`

Recommended storage format first:

- Markdown artifact saved in canonical storage or export layer

Optional later:

- PDF rendering from the Markdown artifact

### Acceptance Criteria

- User can ask for a reusable extract, not just a chat summary
- Artifact is structured enough to place into Notion, GitHub, or future dashboards
- Artifacts are clearly provenance-aware

## Phase 3E: YouTube Refinement

### Goal

Make YouTube a reliable research source class.

### What to Build

- Explicit classification of YouTube URLs
- Metadata extraction
- transcript retrieval when possible
- graceful fallback when transcript is not available
- transcript completeness labeling
- “metadata-only” response path that still produces useful output
- optional “video extract” artifact generation

### Acceptance Criteria

- A YouTube URL yields either:
  - transcript-based analysis
  - or useful metadata-based analysis
- Output explicitly states what evidence was actually available
- The user can reuse the result in downstream writing and planning workflows

## Phase 3F: Comparison Harness

### Goal

Use Manus vs DWC comparisons to improve output systematically.

### What to Build

Create a comparison workflow using 5 to 10 representative inputs:

- webpage
- PubMed
- YouTube
- project-planning input

Score each on:

- clarity
- usefulness
- source faithfulness
- physician-builder relevance
- actionability
- publishability

### Acceptance Criteria

- prompt revisions are driven by observed gaps
- DWC output quality improves with deliberate iteration rather than guesswork

## Recommended Build Order

1. Intent detection upgrade
2. Source-aware template upgrade
3. Critical flags layer
4. Knowledge artifact generation
5. YouTube refinement
6. Comparison harness
7. PDF export

## Deliverables for Phase 3

- improved intent parser
- new or expanded renderer templates
- critical-flags extraction logic
- knowledge artifact output mode
- improved YouTube handling
- comparison rubric and evaluation set

## Definition of Success

At the end of Phase 3:

- DWC Engine should feel more natural to talk to
- outputs should be more context-aware and project-useful
- YouTube inputs should be meaningfully supported
- critical risks should be explicit
- reusable knowledge artifacts should exist
- the gap between Manus and DWC should be much smaller in practical output quality
