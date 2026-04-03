import { config, requireConfigValue } from "../config";
import { buildSourceReferenceCandidates, normalizeSourceReference } from "./sourceReferences";
import type { CurationStatus, PersistedRecordPayload, QueueSort } from "../types";

type QueryableClient = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
  release: () => void;
};

type PoolInstance = {
  connect: () => Promise<QueryableClient>;
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
};

const { Pool } = require("pg") as {
  Pool: new (options: Record<string, unknown>) => PoolInstance;
};

let pool: PoolInstance | null = null;
let databaseReady = false;
let databaseLastError: string | null = null;

function getPool(): PoolInstance {
  if (!pool) {
    requireConfigValue(config.databaseUrl, "DATABASE_URL");
    pool = new Pool({
      connectionString: config.databaseUrl,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
      ssl: config.databaseUrl.includes("localhost")
        ? false
        : {
            rejectUnauthorized: false
          }
    });
  }

  return pool;
}

export async function ensureDatabase(): Promise<void> {
  const client = await getPool().connect();

  try {
    await client.query(`
      create table if not exists research_records (
        id text primary key,
        slug text not null,
        source_type text not null,
        source_reference text not null,
        raw_input text not null,
        normalized_text text not null,
        title text,
        authors jsonb not null default '[]'::jsonb,
        publication text,
        source_date text,
        completeness text not null,
        requested_action text not null,
        tags jsonb not null default '[]'::jsonb,
        created_at timestamptz not null,
        model text not null,
        status text not null,
        metadata jsonb not null default '{}'::jsonb,
        outputs jsonb not null default '{}'::jsonb,
        export_paths jsonb not null default '[]'::jsonb,
        github_sync_status text not null default 'not_requested',
        github_sync_target text,
        curation_status text not null default 'new',
        updated_at timestamptz not null default now()
      )
    `);
    await client.query(`
      alter table research_records
      add column if not exists curation_status text not null default 'new'
    `);
    databaseReady = true;
    databaseLastError = null;
  } catch (error) {
    databaseReady = false;
    databaseLastError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    client.release();
  }
}

export function isDatabaseReady(): boolean {
  return databaseReady;
}

export function getDatabaseDiagnostics(): {
  ready: boolean;
  lastError: string | null;
} {
  return {
    ready: databaseReady,
    lastError: databaseLastError
  };
}

export async function persistRecord(payload: PersistedRecordPayload): Promise<void> {
  const { record, outputs, exportPaths, githubSyncStatus = "not_requested", githubSyncTarget } = payload;

  await getPool().query(
    `
      insert into research_records (
        id,
        slug,
        source_type,
        source_reference,
        raw_input,
        normalized_text,
        title,
        authors,
        publication,
        source_date,
        completeness,
        requested_action,
        tags,
        created_at,
        model,
        status,
        metadata,
        outputs,
        export_paths,
        github_sync_status,
        github_sync_target,
        curation_status,
        updated_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17::jsonb, $18::jsonb, $19::jsonb, $20, $21, $22, now()
      )
      on conflict (id) do update set
        slug = excluded.slug,
        source_type = excluded.source_type,
        source_reference = excluded.source_reference,
        raw_input = excluded.raw_input,
        normalized_text = excluded.normalized_text,
        title = excluded.title,
        authors = excluded.authors,
        publication = excluded.publication,
        source_date = excluded.source_date,
        completeness = excluded.completeness,
        requested_action = excluded.requested_action,
        tags = excluded.tags,
        created_at = excluded.created_at,
        model = excluded.model,
        status = excluded.status,
        metadata = excluded.metadata,
        outputs = excluded.outputs,
        export_paths = excluded.export_paths,
        github_sync_status = excluded.github_sync_status,
        github_sync_target = excluded.github_sync_target,
        curation_status = coalesce(research_records.curation_status, excluded.curation_status),
        updated_at = now()
    `,
    [
      record.id,
      record.slug,
      record.sourceType,
      record.sourceReference,
      record.rawInput,
      record.normalizedText,
      record.title ?? null,
      JSON.stringify(record.authors),
      record.publication ?? null,
      record.date ?? null,
      record.completeness,
      record.requestedAction,
      JSON.stringify(record.tags),
      record.createdAt,
      record.model,
      record.status,
      JSON.stringify(record.metadata),
      JSON.stringify(outputs),
      JSON.stringify(exportPaths),
      githubSyncStatus,
      githubSyncTarget ?? null,
      "new"
    ]
  );
}

export async function fetchRecordById(recordId: string): Promise<{
  id: string;
  slug: string;
  sourceType: string;
  requestedAction: string;
  title: string | null;
  createdAt: string;
  output: string;
  sourceReference?: string;
  normalizedText?: string;
  completeness?: string;
  publication?: string | null;
  date?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  curationStatus?: CurationStatus;
} | null> {
  const result = (await getPool().query(
    `
      select
        id,
        slug,
        source_type as "sourceType",
        requested_action as "requestedAction",
        title,
        created_at as "createdAt",
        outputs->>'output' as output,
        source_reference as "sourceReference",
        normalized_text as "normalizedText",
        completeness,
        publication,
        source_date as date,
        tags,
        metadata,
        curation_status as "curationStatus"
      from research_records
      where id = $1
      limit 1
    `,
    [recordId]
  )) as {
    rows: Array<{
      id: string;
      slug: string;
      sourceType: string;
      requestedAction: string;
      title: string | null;
      createdAt: string;
      output: string | null;
      sourceReference: string;
      normalizedText: string;
      completeness: string;
      publication: string | null;
      date: string | null;
      tags: string[] | null;
      metadata: Record<string, unknown> | null;
      curationStatus: CurationStatus | null;
    }>;
  };

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    output: row.output ?? "No stored output was found for this record.",
    tags: row.tags ?? [],
    metadata: row.metadata ?? {},
    curationStatus: row.curationStatus ?? "new"
  };
}

export async function fetchRecordBySourceReference(sourceReference: string): Promise<{
  id: string;
  slug: string;
  sourceType: string;
  requestedAction: string;
  title: string | null;
  createdAt: string;
  output: string;
  sourceReference?: string;
  normalizedText?: string;
  completeness?: string;
  publication?: string | null;
  date?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  curationStatus?: CurationStatus;
} | null> {
  const normalizedReference = normalizeSourceReference(sourceReference);
  const candidates = buildSourceReferenceCandidates(sourceReference);

  const result = (await getPool().query(
    `
      select
        id,
        slug,
        source_type as "sourceType",
        requested_action as "requestedAction",
        title,
        created_at as "createdAt",
        outputs->>'output' as output,
        source_reference as "sourceReference",
        normalized_text as "normalizedText",
        completeness,
        publication,
        source_date as date,
        tags,
        metadata,
        curation_status as "curationStatus",
        case
          when lower(source_reference) = lower($1) then 0
          when lower(source_reference) = any($2::text[]) then 1
          else 2
        end as match_rank
      from research_records
      where lower(source_reference) = lower($1)
         or lower(source_reference) = any($2::text[])
      order by match_rank asc, created_at desc
      limit 1
    `,
    [normalizedReference, candidates.map((candidate) => candidate.toLowerCase())]
  )) as {
    rows: Array<{
      id: string;
      slug: string;
      sourceType: string;
      requestedAction: string;
      title: string | null;
      createdAt: string;
      output: string | null;
      sourceReference: string;
      normalizedText: string;
      completeness: string;
      publication: string | null;
      date: string | null;
      tags: string[] | null;
      metadata: Record<string, unknown> | null;
      curationStatus: CurationStatus | null;
      match_rank: number;
    }>;
  };

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    output: row.output ?? "No stored output was found for this record.",
    tags: row.tags ?? [],
    metadata: row.metadata ?? {},
    curationStatus: row.curationStatus ?? "new"
  };
}

export async function fetchRecentRecords(params?: {
  limit?: number;
  sourceType?: string;
  topics?: string[];
  createdAfter?: string;
  createdBefore?: string;
  curationStatus?: CurationStatus;
}): Promise<
  Array<{
    id: string;
    title: string | null;
    sourceType: string;
    requestedAction: string;
    createdAt: string;
    curationStatus: CurationStatus;
  }>
> {
  const limit = Math.min(Math.max(params?.limit ?? 5, 1), 10);
  const sourceType = params?.sourceType;
  const topics = params?.topics?.length ? params.topics.map((topic) => topic.toLowerCase()) : null;
  const createdAfter = params?.createdAfter ?? null;
  const createdBefore = params?.createdBefore ?? null;
  const curationStatus = params?.curationStatus;

  const result = (await getPool().query(
    `
      select
        id,
        title,
        source_type as "sourceType",
        requested_action as "requestedAction",
        created_at as "createdAt",
        curation_status as "curationStatus"
      from research_records
      where ($1::text is null or source_type = $1)
        and ($2::text is null or curation_status = $2)
        and ($3::date is null or created_at::date >= $3::date)
        and ($4::date is null or created_at::date <= $4::date)
        and (
          $5::text[] is null
          or exists (
            select 1
            from unnest($5::text[]) as topic
            where coalesce(title, '') ilike '%' || topic || '%'
              or source_reference ilike '%' || topic || '%'
              or normalized_text ilike '%' || topic || '%'
              or coalesce(outputs->>'output', '') ilike '%' || topic || '%'
              or exists (
                select 1
                from jsonb_array_elements_text(
                  case
                    when jsonb_typeof(tags) = 'array' then tags
                    else '[]'::jsonb
                  end
                ) as tag
                where lower(tag) like '%' || topic || '%'
              )
          )
        )
      order by created_at desc
      limit $6
    `,
    [sourceType ?? null, curationStatus ?? null, createdAfter, createdBefore, topics, limit]
  )) as {
    rows: Array<{
      id: string;
      title: string | null;
      sourceType: string;
      requestedAction: string;
      createdAt: string;
      curationStatus: CurationStatus;
    }>;
  };

  return result.rows;
}

export async function fetchQueueRecords(params?: {
  limit?: number;
  sourceType?: string;
  topics?: string[];
  createdAfter?: string;
  createdBefore?: string;
  curationStatuses?: CurationStatus[];
  queueSort?: QueueSort;
}): Promise<
  Array<{
    id: string;
    title: string | null;
    sourceType: string;
    requestedAction: string;
    createdAt: string;
    curationStatus: CurationStatus;
    ageDays: number;
  }>
> {
  const limit = Math.min(Math.max(params?.limit ?? 10, 1), 20);
  const sourceType = params?.sourceType;
  const topics = params?.topics?.length ? params.topics.map((topic) => topic.toLowerCase()) : null;
  const createdAfter = params?.createdAfter ?? null;
  const createdBefore = params?.createdBefore ?? null;
  const queueSort = params?.queueSort ?? "priority";
  const statuses = params?.curationStatuses?.length
    ? params.curationStatuses
    : (["reviewed", "drafted", "publish_ready"] as CurationStatus[]);

  const result = (await getPool().query(
    `
      select
        id,
        title,
        source_type as "sourceType",
        requested_action as "requestedAction",
        created_at as "createdAt",
        curation_status as "curationStatus",
        greatest(0, floor(extract(epoch from (now() - created_at)) / 86400))::int as "ageDays"
      from research_records
      where ($1::text is null or source_type = $1)
        and curation_status = any($2::text[])
        and ($3::date is null or created_at::date >= $3::date)
        and ($4::date is null or created_at::date <= $4::date)
        and (
          $5::text[] is null
          or exists (
            select 1
            from unnest($5::text[]) as topic
            where coalesce(title, '') ilike '%' || topic || '%'
              or source_reference ilike '%' || topic || '%'
              or normalized_text ilike '%' || topic || '%'
              or coalesce(outputs->>'output', '') ilike '%' || topic || '%'
              or exists (
                select 1
                from jsonb_array_elements_text(
                  case
                    when jsonb_typeof(tags) = 'array' then tags
                    else '[]'::jsonb
                  end
                ) as tag
                where lower(tag) like '%' || topic || '%'
              )
          )
        )
      order by
        case
          when $6::text = 'priority' then
            case curation_status
              when 'publish_ready' then 1
              when 'drafted' then 2
              when 'reviewed' then 3
              else 4
            end
          else null
        end asc nulls last,
        case when $6::text = 'priority' then created_at end asc nulls last,
        case when $6::text = 'oldest' then created_at end asc nulls last,
        case when $6::text = 'newest' then created_at end desc nulls last,
        created_at desc
      limit $7
    `,
    [sourceType ?? null, statuses, createdAfter, createdBefore, topics, queueSort, limit]
  )) as {
    rows: Array<{
      id: string;
      title: string | null;
      sourceType: string;
      requestedAction: string;
      createdAt: string;
      curationStatus: CurationStatus;
      ageDays: number;
    }>;
  };

  return result.rows;
}

export async function searchRecords(params: {
  query: string;
  limit?: number;
  sourceType?: string;
  topics?: string[];
  createdAfter?: string;
  createdBefore?: string;
  curationStatus?: CurationStatus;
}): Promise<
  Array<{
    id: string;
    title: string | null;
    sourceType: string;
    requestedAction: string;
    createdAt: string;
    curationStatus: CurationStatus;
    matchPreview: string | null;
  }>
> {
  const limit = Math.min(Math.max(params.limit ?? 5, 1), 10);
  const sourceType = params.sourceType;
  const topics = params.topics?.length ? params.topics.map((topic) => topic.toLowerCase()) : null;
  const createdAfter = params.createdAfter ?? null;
  const createdBefore = params.createdBefore ?? null;
  const curationStatus = params.curationStatus;
  const trimmedQuery = params.query.trim();
  const searchQuery = `%${trimmedQuery}%`;
  const exactQuery = trimmedQuery.toLowerCase();
  const prefixQuery = `${exactQuery}%`;
  const queryTerms = [...new Set(trimmedQuery.toLowerCase().split(/\s+/).filter(Boolean))];
  const partialTermQueries = queryTerms.map((term) => `%${term}%`);

  const result = (await getPool().query(
    `
      select
        id,
        title,
        source_type as "sourceType",
        requested_action as "requestedAction",
        created_at as "createdAt",
        curation_status as "curationStatus",
        case
          when lower(coalesce(title, '')) = $6 then trim(coalesce(title, ''))
          when lower(source_reference) = $6 then source_reference
          when lower(coalesce(title, '')) like $7 then trim(coalesce(title, ''))
          when coalesce(title, '') ilike $8 then trim(coalesce(title, ''))
          when source_reference ilike $8 then source_reference
          when exists (
            select 1
            from jsonb_array_elements_text(
              case
                when jsonb_typeof(tags) = 'array' then tags
                else '[]'::jsonb
              end
            ) as tag
            where lower(tag) = any($9::text[])
               or lower(tag) like any($10::text[])
          )
          then (
            select 'Tags: ' || string_agg(tag, ', ' order by tag)
            from (
              select distinct tag
              from jsonb_array_elements_text(
                case
                  when jsonb_typeof(tags) = 'array' then tags
                  else '[]'::jsonb
                end
              ) as tag
              where lower(tag) = any($9::text[])
                 or lower(tag) like any($10::text[])
              limit 3
            ) matched_tags
          )
          when normalized_text ilike $8 then trim(substr(normalized_text, greatest(strpos(lower(normalized_text), $6) - 50, 1), 220))
          when coalesce(outputs->>'output', '') ilike $8 then trim(substr(coalesce(outputs->>'output', ''), greatest(strpos(lower(coalesce(outputs->>'output', '')), $6) - 50, 1), 220))
          else null
        end as "matchPreview",
        (
          case when lower(coalesce(title, '')) = $6 then 120 else 0 end +
          case when lower(source_reference) = $6 then 140 else 0 end +
          case when lower(coalesce(title, '')) like $7 then 60 else 0 end +
          case when lower(source_reference) like $7 then 50 else 0 end +
          case when coalesce(title, '') ilike $8 then 30 else 0 end +
          case when source_reference ilike $8 then 20 else 0 end +
          case
            when exists (
              select 1
              from jsonb_array_elements_text(
                case
                  when jsonb_typeof(tags) = 'array' then tags
                  else '[]'::jsonb
                end
              ) as tag
              where lower(tag) = any($9::text[])
            )
            then 25
            else 0
          end +
          case
            when exists (
              select 1
              from jsonb_array_elements_text(
                case
                  when jsonb_typeof(tags) = 'array' then tags
                  else '[]'::jsonb
                end
              ) as tag
              where lower(tag) like any($10::text[])
            )
            then 10
            else 0
          end +
          case
            when lower(requested_action) = $6 then 16
            when lower(requested_action) like $7 then 8
            else 0
          end +
          case
            when lower(source_type) = $6 then 12
            when lower(source_type) like $7 then 6
            else 0
          end +
          (
            select coalesce(
              sum(
                case
                  when lower(coalesce(title, '')) = term then 40
                  when lower(coalesce(title, '')) like term || '%' then 18
                  when lower(coalesce(title, '')) like '%' || term || '%' then 10
                  when lower(source_reference) = term then 30
                  when lower(source_reference) like '%' || term || '%' then 8
                  when exists (
                    select 1
                    from jsonb_array_elements_text(
                      case
                        when jsonb_typeof(tags) = 'array' then tags
                        else '[]'::jsonb
                      end
                    ) as tag
                    where lower(tag) = term
                  )
                  then 12
                  when exists (
                    select 1
                    from jsonb_array_elements_text(
                      case
                        when jsonb_typeof(tags) = 'array' then tags
                        else '[]'::jsonb
                      end
                    ) as tag
                    where lower(tag) like '%' || term || '%'
                  )
                  then 6
                  when lower(normalized_text) like '%' || term || '%' then 2
                  when lower(coalesce(outputs->>'output', '')) like '%' || term || '%' then 1
                  else 0
                end
              ),
              0
            )
            from unnest($9::text[]) as term
          ) +
          case
            when created_at >= now() - interval '7 days' then 4
            when created_at >= now() - interval '30 days' then 2
            else 0
          end
        ) as rank
      from research_records
      where ($1::text is null or source_type = $1)
        and ($2::text is null or curation_status = $2)
        and ($3::date is null or created_at::date >= $3::date)
        and ($4::date is null or created_at::date <= $4::date)
        and (
          $5::text[] is null
          or exists (
            select 1
            from unnest($5::text[]) as topic
            where coalesce(title, '') ilike '%' || topic || '%'
              or source_reference ilike '%' || topic || '%'
              or normalized_text ilike '%' || topic || '%'
              or coalesce(outputs->>'output', '') ilike '%' || topic || '%'
              or exists (
                select 1
                from jsonb_array_elements_text(
                  case
                    when jsonb_typeof(tags) = 'array' then tags
                    else '[]'::jsonb
                  end
                ) as tag
                where lower(tag) like '%' || topic || '%'
              )
          )
        )
        and (
          coalesce(title, '') ilike $8
          or source_reference ilike $8
          or normalized_text ilike $8
          or coalesce(outputs->>'output', '') ilike $8
          or lower(requested_action) like $7
          or lower(source_type) like $7
          or exists (
            select 1
            from jsonb_array_elements_text(
              case
                when jsonb_typeof(tags) = 'array' then tags
                else '[]'::jsonb
              end
            ) as tag
            where lower(tag) = any($9::text[])
               or lower(tag) like any($10::text[])
          )
        )
      order by rank desc, created_at desc
      limit $11
    `,
    [
      sourceType ?? null,
      curationStatus ?? null,
      createdAfter,
      createdBefore,
      topics,
      exactQuery,
      prefixQuery,
      searchQuery,
      queryTerms,
      partialTermQueries,
      limit
    ]
  )) as {
    rows: Array<{
      id: string;
      title: string | null;
      sourceType: string;
      requestedAction: string;
      createdAt: string;
      curationStatus: CurationStatus;
      matchPreview: string | null;
      rank: number;
    }>;
  };

  return result.rows;
}

export async function updateRecordCurationStatus(recordId: string, status: CurationStatus): Promise<{
  id: string;
  title: string | null;
  curationStatus: CurationStatus;
} | null> {
  const result = (await getPool().query(
    `
      update research_records
      set curation_status = $2,
          updated_at = now()
      where id = $1
      returning id, title, curation_status as "curationStatus"
    `,
    [recordId, status]
  )) as {
    rows: Array<{
      id: string;
      title: string | null;
      curationStatus: CurationStatus;
    }>;
  };

  return result.rows[0] ?? null;
}
