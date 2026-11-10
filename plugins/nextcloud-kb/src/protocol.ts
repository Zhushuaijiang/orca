// The panel ↔ worker contract, declared once: src and worker both read it.

export type KbEntry = {
  name: string
  /** Path relative to the user's Nextcloud files root, always starting with '/'. */
  path: string
  dir: boolean
  size: number
  modifiedMs: number | null
  etag: string | null
  fileId: string | null
}

export type KbSearchEntry = {
  name: string
  path: string
  dir: boolean
  subline: string
}

export type KbReadResult =
  | {
      kind: 'text'
      text: string
      truncated: boolean
      byteLength: number
      etag: string | null
      modifiedMs: number | null
    }
  | {
      kind: 'binary'
      byteLength: number
      contentType: string | null
      etag: string | null
      modifiedMs: number | null
    }

declare module 'orca' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging needs an interface
  interface PluginRequests {
    /** Connection state; `ok` re-validates the stored credentials with a cheap PROPFIND. `refreshIndex` drops the local search index first. */
    'kb.status': {
      input: { refreshIndex?: boolean }
      output: {
        configured: boolean
        serverUrl: string
        username: string
        ok: boolean
        error: string | null
      }
    }
    /** Validate and persist server URL, username and app password (settings + secret). */
    'kb.connect': {
      input: { serverUrl: string; username: string; appPassword: string }
      output: { ok: true; displayName: string | null }
    }
    /** One directory level of the user's files root (PROPFIND Depth 1), folders first. */
    'kb.list': { input: { path: string }; output: { entries: KbEntry[] } }
    /** Filename search; served from a worker-side name index (built lazily, `indexed: false` means server search). */
    'kb.search': {
      input: { term: string; cursor: string | null; refresh?: boolean }
      output: {
        entries: KbSearchEntry[]
        cursor: string | null
        /** `indexed` is false while the crawl is still filling; `ocs` is the server fallback. */
        indexed: boolean
        source: 'index' | 'ocs'
        indexSize: number
        indexTruncated: boolean
      }
    }
    /** Read one file; text kinds are decoded UTF-8 and capped at `maxBytes`. */
    'kb.read': {
      input: { path: string; maxBytes: number }
      output: KbReadResult
    }
    /** Overwrite one text file. A stale `etag` fails with code `conflict`. */
    'kb.write': {
      input: { path: string; text: string; etag: string | null }
      output: { ok: true; etag: string | null }
    }
    /** Reuse-or-create the public link share for one entry; the URL opens without a Nextcloud login. */
    'kb.share': { input: { path: string }; output: { url: string; reused: boolean } }
    /** Create a directory (fails with `conflict` when the name exists). */
    'kb.mkdir': { input: { path: string }; output: { ok: true } }
    /** Delete a file or directory (recursively). */
    'kb.delete': { input: { path: string }; output: { ok: true } }
    /** Move/rename an entry; `conflict` when the target exists. */
    'kb.move': { input: { fromPath: string; toPath: string }; output: { ok: true } }
    /** One 512 KiB slice of a file, base64, for background-prefetched downloads. */
    'kb.blobChunk': {
      input: { path: string; offset: number; length: number }
      output: {
        base64: string
        byteLength: number
        total: number | null
        done: boolean
        etag: string | null
      }
    }
    /** Upload a local file from this machine into the knowledge base. */
    'kb.uploadLocal': {
      input: { localPath: string; dirPath: string; name: string }
      output: { ok: true; etag: string | null; size: number }
    }
  }
}
