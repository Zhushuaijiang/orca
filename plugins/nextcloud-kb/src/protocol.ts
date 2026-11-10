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

export {}

declare module 'orca' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging needs an interface
  interface PluginRequests {
    /** Connection state; `ok` re-validates the stored credentials with a cheap PROPFIND. */
    'kb.status': {
      input: {}
      output: { configured: boolean; serverUrl: string; username: string; ok: boolean; error: string | null }
    }
    /** Validate and persist server URL, username and app password (settings + secret). */
    'kb.connect': {
      input: { serverUrl: string; username: string; appPassword: string }
      output: { ok: true; displayName: string | null }
    }
    /** One directory level of the user's files root (PROPFIND Depth 1), folders first. */
    'kb.list': { input: { path: string }; output: { entries: KbEntry[] } }
    /** Filename search through Nextcloud's unified `files` provider, cursor-paged. */
    'kb.search': {
      input: { term: string; cursor: string | null }
      output: { entries: KbSearchEntry[]; cursor: string | null }
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
    /** Create a public link share for one entry. */
    'kb.share': { input: { path: string }; output: { url: string } }
    /** Create a directory (fails with `conflict` when the name exists). */
    'kb.mkdir': { input: { path: string }; output: { ok: true } }
    /** Delete a file or directory (recursively). */
    'kb.delete': { input: { path: string }; output: { ok: true } }
    /** Move/rename an entry; `conflict` when the target exists. */
    'kb.move': { input: { fromPath: string; toPath: string }; output: { ok: true } }
    /** One byte range of a file, base64, for chunked downloads. */
    'kb.range': {
      input: { path: string; offset: number; length: number }
      output: { base64: string; done: boolean; total: number | null }
    }
    /** Upload a local file from this machine into the knowledge base. */
    'kb.uploadLocal': {
      input: { localPath: string; dirPath: string; name: string }
      output: { ok: true; etag: string | null; size: number }
    }
  }
}
