// Narrow ambient typings for the Node builtin this worker uses. The real
// module is resolved by Node at runtime; this describes only the surface the
// plugin touches, so `tsc -p .` passes without @types/node.

declare module 'node:fs/promises' {
  export function readFile(path: string): Promise<Uint8Array>
  export function stat(path: string): Promise<{ size: number; isFile(): boolean }>
}

declare module 'node:fs' {
  export function existsSync(path: string): boolean
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function writeFileSync(path: string, data: string, options?: { mode?: number }): void
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void
}

declare module 'node:os' {
  export function homedir(): string
}

declare module 'node:path' {
  export function join(...parts: string[]): string
}

declare module 'node:http' {
  export type IncomingMessage = {
    method?: string
    url?: string
    on(event: 'data', cb: (chunk: Uint8Array) => void): void
    on(event: 'end', cb: () => void): void
  }
  export type ServerResponse = {
    writeHead(code: number, headers: Record<string, string>): void
    end(body?: string): void
  }
  export type Server = {
    once(event: 'error', cb: (error: Error) => void): void
    listen(port: number, host: string, cb: () => void): void
    address(): { port: number } | string | null
    close(): void
  }
  export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Server
}
