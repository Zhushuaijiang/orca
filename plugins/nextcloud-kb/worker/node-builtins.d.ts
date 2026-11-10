// Narrow ambient typings for the Node builtin this worker uses. The real
// module is resolved by Node at runtime; this describes only the surface the
// plugin touches, so `tsc -p .` passes without @types/node.

declare module 'node:fs/promises' {
  export function readFile(path: string): Promise<Uint8Array>
  export function stat(path: string): Promise<{ size: number; isFile(): boolean }>
}
