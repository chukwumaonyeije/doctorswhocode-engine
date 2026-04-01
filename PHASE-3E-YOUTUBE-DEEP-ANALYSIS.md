# Phase 3E.1 Build Spec: Deep YouTube Analysis Workflow

## Purpose

This build spec defines the next YouTube upgrade for DWC Engine.

The goal is not merely to “support YouTube URLs.” The goal is to make YouTube inputs useful for physician-developer reasoning, project planning, and content generation in a way that begins to close the gap with Manus.

At present, DWC Engine can:

- detect YouTube URLs
- extract metadata
- attempt transcript retrieval
- fall back honestly to metadata-only output when transcript retrieval fails

That is source-aware and correct, but still limited compared with Manus, which behaves more like an asynchronous analyst.

This phase adds a deeper video-analysis workflow while preserving DWC’s commitment to provenance and explicit completeness.

## Problem Statement

Current DWC YouTube behavior is limited by synchronous, quick-turn analysis.

That creates three gaps:

1. It can feel shallow when the transcript is not immediately available.
2. It does not yet support a “working on it” analysis model for longer video tasks.
3. It does not yet adapt deeply enough to the user’s requested lens, such as:
   - “What can a doctor who codes take away from this?”
   - “As a cautionary tale”

## Product Goal

Allow DWC Engine to process YouTube videos in two layers:

- fast analysis
- deep analysis

Fast analysis remains available for immediate use.

Deep analysis should:

- acknowledge the request immediately
- attempt deeper transcript/content extraction
- use the user’s requested lens
- produce a more useful structured result
- clearly distinguish verified findings from inference or metadata-only interpretation

## Core Principles

### Principle 1: Provenance First

The system must never imply it watched or understood the full video unless transcript or equivalent content was actually available.

### Principle 2: Explicit Completeness

Every deep YouTube result must state whether it is based on:

- transcript
- metadata and description only
- partial extraction

### Principle 3: Lens-Aware Interpretation

If the user provides a frame such as:

- “for the DWC engine”
- “for physician developers”
- “as a cautionary tale”
- “for a blog post”

that lens should materially shape the analysis.

### Principle 4: Asynchronous UX

Longer YouTube analysis should acknowledge immediately, then complete after processing.

## Scope

### In Scope

- fast vs deep YouTube analysis modes
- immediate acknowledgement/preamble for deep video jobs
- deeper transcript retrieval attempts
- lens-aware prompt shaping
- structured YouTube deep-analysis template
- explicit “verified vs unverified” rendering
- Telegram delivery flow for multi-step responses

### Out of Scope

- full multimedia understanding beyond transcript and metadata
- OCR from frames
- audio transcription from raw downloaded video in this phase
- PDF generation in this phase

## User Stories

### Story 1

As a physician-developer, I want to send a YouTube link with a natural-language framing request so the output reflects my actual use case, not just generic summarization.

### Story 2

As a user, I want DWC Engine to tell me when it is doing a deeper analysis and return later with a fuller result.

### Story 3

As a user, I want the bot to be explicit about what was actually available from the video so I know how much to trust the result.

### Story 4

As a physician-builder, I want critical risks, cautionary lessons, and implementation implications called out clearly.

## Functional Requirements

### 1. Deep Analysis Trigger

The system must trigger deep YouTube analysis when:

- the user explicitly asks for analysis, takeaways, risks, lessons, cautionary framing, or blog generation
- the user’s natural-language request implies more than a quick digest

Examples:

- “What can a doctor who codes take away from this?”
- “Analyze this as a cautionary tale”
- “Extract useful information from this video for the DWC engine”
- “Turn this into a blog post”

### 2. Immediate Acknowledgement

For deep YouTube analysis, Telegram must first receive a short acknowledgement such as:

- “Analyzing this video now. I’m extracting what I can and will return with a deeper source-aware read.”

This acknowledgement must not overstate that the transcript is definitely available.

### 3. Transcript Retrieval Strategy

The system must attempt transcript retrieval using the current adapter.

If transcript retrieval succeeds:

- analyze transcript plus metadata

If transcript retrieval fails:

- analyze metadata plus description only
- explicitly mark the result as metadata-only

### 4. Lens-Aware Prompting

The deep analysis prompt must include:

- the user’s natural-language intent
- any context note
- requested focus tags
- source completeness

The output must materially reflect those lenses.

### 5. Deep YouTube Output Template

Deep YouTube outputs should use a structure like:

- What this is
- Core claim
- What appears to be in the video
- What is verified vs unverified
- Physician-developer takeaway
- Critical flags
- Recommended next step

Alternative names are acceptable, but the structure must preserve these functions.

### 6. Verified vs Unverified Layer

The output must explicitly separate:

- claims supported by transcript or metadata
- claims that remain unverified

This is especially important when the title is provocative or sensational.

### 7. Storage

Deep YouTube analysis should be persisted like other canonical outputs:

- normalized record
- rendered output
- source completeness state
- intent metadata

## UX Requirements

### Fast Mode

If the user simply posts a YouTube URL:

- default to a fast digest
- do not force a deep analysis path

### Deep Mode

If the user asks a richer question:

- acknowledge
- analyze
- return a fuller structured output

### Failure Handling

If transcript retrieval fails:

- do not fail the request outright
- return a useful metadata-based analysis
- clearly state the limitation

## Technical Design Direction

### Step 1: Analysis Mode Classification

Add a YouTube analysis mode decision:

- `youtube_fast`
- `youtube_deep`

This can be inferred from intent parsing.

### Step 2: Telegram Multi-Message Flow

For deep analysis:

1. send acknowledgement
2. run deep extraction and analysis
3. send final output

### Step 3: Prompt Upgrade

Create or extend a prompt specifically for deep YouTube analysis.

### Step 4: Output Renderer

Add a YouTube-deep renderer or a source-aware branch within the existing renderer path.

### Step 5: Metadata Recording

Persist:

- transcript availability
- analysis mode
- user lens/context
- verification state

## Acceptance Criteria

### Minimum Success

- DWC Engine no longer gives only shallow metadata output for richer YouTube requests
- it acknowledges deep-analysis tasks before returning the final result
- it remains explicit about transcript availability and verification state

### Strong Success

- YouTube outputs feel substantially more useful for project reasoning
- physician-developer implications are clearer
- sensational video titles no longer dominate the interpretation
- the user can ask a natural-language question and receive a context-aware answer

## Example Desired Behavior

### Input

“What can a doctor who codes take away from this? As a cautionary tale”

plus a YouTube URL

### Immediate Response

“Analyzing this video now. I’m extracting what I can and will return with a deeper physician-developer reading.”

### Final Response

- What this is
- Core claim
- What is actually supported by the available source material
- Why this matters for a doctor who codes
- Critical flags
- What remains unverified
- Recommended next step

## Recommended Build Order

1. Add YouTube fast vs deep mode classification
2. Add acknowledgement message flow
3. Add deep YouTube prompt
4. Add verified vs unverified output sections
5. Add source-aware renderer branch for deep YouTube analysis
6. Persist additional YouTube analysis metadata

## Definition of Done

Phase 3E.1 is done when DWC Engine can receive a rich YouTube request in natural language, acknowledge that it is doing deeper work, return a structured and source-honest analysis, and preserve the result in canonical storage without pretending it accessed content it did not actually retrieve.
