
And here is a second file I would place beside it as `PROJECT-BRIEF.md`. This is shorter and more operational for Codex to act on.

```markdown
# Project Brief for Codex

Build a Telegram-driven research ingestion system for Dr. Chukwuma Onyeije.

The system must accept command-based inputs such as:
- digest
- file
- summarize
- mdx

The system must support:
- URLs
- PubMed IDs / PubMed URLs
- pasted text
- pasted transcripts
- future audio transcription input

The repo must be file-first, modular, and maintainable.

Key constraints:
- No n8n
- Local repo as source of truth
- GitHub for version control and persistence
- Railway for deployment
- Telegram as primary interface
- Astro-compatible MDX output

Key architectural rule:
All source inputs must be normalized before rendering output.

Key implementation rule:
Do not build one giant “summarize everything” prompt.
Instead, build adapters by source type and renderers by output mode.

Initial priority:
1. working Telegram command router
2. URL ingestion
3. PubMed ingestion
4. digest / summarize / mdx outputs
5. file persistence
6. local-first development
7. Railway deployment

Definition of done for V1:
- I can send `digest <url>` and get a reliable response
- I can send `file <pubmed id>` and archive it
- I can send `mdx <url>` and generate a clean Astro-ready draft
- the output is saved in predictable repo folders