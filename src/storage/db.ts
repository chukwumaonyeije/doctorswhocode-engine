import { config, requireConfigValue } from "../config";
import type { PersistedRecordPayload } from "../types";

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

function getPool(): PoolInstance {
  if (!pool) {
    requireConfigValue(config.databaseUrl, "DATABASE_URL");
    pool = new Pool({
      connectionString: config.databaseUrl,
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
        updated_at timestamptz not null default now()
      )
    `);
  } finally {
    client.release();
  }
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
        updated_at
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13::jsonb, $14, $15, $16, $17::jsonb, $18::jsonb, $19::jsonb, $20, $21, now()
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
      githubSyncTarget ?? null
    ]
  );
}
