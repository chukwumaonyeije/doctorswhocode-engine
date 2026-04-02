import { config, requireConfigValue } from "../config";
import type { CurationStatus, PersistedRecordPayload } from "../types";

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
  } finally {
    client.release();
  }
}

export function isDatabaseReady(): boolean {
  return databaseReady;
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

export async function fetchRecentRecords(params?: {
  limit?: number;
  sourceType?: string;
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
      order by created_at desc
      limit $3
    `,
    [sourceType ?? null, curationStatus ?? null, limit]
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
  curationStatuses?: CurationStatus[];
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
  const limit = Math.min(Math.max(params?.limit ?? 10, 1), 20);
  const sourceType = params?.sourceType;
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
        curation_status as "curationStatus"
      from research_records
      where ($1::text is null or source_type = $1)
        and curation_status = any($2::text[])
      order by
        case curation_status
          when 'publish_ready' then 1
          when 'drafted' then 2
          when 'reviewed' then 3
          else 4
        end,
        created_at desc
      limit $3
    `,
    [sourceType ?? null, statuses, limit]
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

export async function searchRecords(params: {
  query: string;
  limit?: number;
  sourceType?: string;
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
  const limit = Math.min(Math.max(params.limit ?? 5, 1), 10);
  const sourceType = params.sourceType;
  const curationStatus = params.curationStatus;
  const searchQuery = `%${params.query.trim()}%`;

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
        and (
          coalesce(title, '') ilike $3
          or source_reference ilike $3
          or normalized_text ilike $3
          or coalesce(outputs->>'output', '') ilike $3
        )
      order by created_at desc
      limit $4
    `,
    [sourceType ?? null, curationStatus ?? null, searchQuery, limit]
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
