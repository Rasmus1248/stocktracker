import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/** A synced document: the user's portfolios plus a version counter for conflict detection. */
export interface SyncDoc {
  version: number;
  updatedAt: string;
  data: unknown;
}

export interface SyncStore {
  get(id: string): Promise<SyncDoc | null>;
  put(id: string, doc: SyncDoc): Promise<void>;
}

/** Sync codes are secrets; store under a hash so the database never holds the code itself. */
export const storageKey = (code: string) => createHash("sha256").update(code).digest("hex");

/** Upstash Redis over its REST API (what Vercel's "Upstash for Redis" Marketplace integration provides). */
class RedisStore implements SyncStore {
  constructor(private url: string, private token: string) {}

  private async cmd(...args: string[]): Promise<unknown> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const body = (await res.json().catch(() => ({}))) as { result?: unknown; error?: string };
    if (!res.ok || body.error) throw new Error(`Sync storage error: ${body.error ?? res.status}`);
    return body.result;
  }

  async get(id: string) {
    const raw = await this.cmd("GET", `stocktracker:sync:${id}`);
    return typeof raw === "string" ? (JSON.parse(raw) as SyncDoc) : null;
  }

  async put(id: string, doc: SyncDoc) {
    await this.cmd("SET", `stocktracker:sync:${id}`, JSON.stringify(doc));
  }
}

/** JSON files on disk, for local development and hosts with a persistent filesystem. */
class FileStore implements SyncStore {
  constructor(private dir: string) {}

  async get(id: string) {
    try {
      return JSON.parse(await readFile(path.join(this.dir, `${id}.json`), "utf8")) as SyncDoc;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async put(id: string, doc: SyncDoc) {
    await mkdir(this.dir, { recursive: true });
    const file = path.join(this.dir, `${id}.json`);
    await writeFile(`${file}.tmp`, JSON.stringify(doc));
    await rename(`${file}.tmp`, file);
  }
}

export function createStore(env = process.env): SyncStore | null {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (url && token) return new RedisStore(url, token);
  // Serverless filesystems are ephemeral, so on Vercel sync needs Redis configured.
  if (env.VERCEL) return null;
  return new FileStore(path.resolve(env.SYNC_DIR ?? "data/sync"));
}
