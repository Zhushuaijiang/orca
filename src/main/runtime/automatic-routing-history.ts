import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { getProfileUserDataPath } from '../orca-profiles/profile-storage-paths'
import { AutomaticTaskDecisionSchema } from '../../shared/automatic-task-routing'
import { isTuiAgent } from '../../shared/tui-agent-config'
import type { TuiAgent } from '../../shared/tui-agent'
import { writePluginFileAtomically } from '../plugins/plugin-atomic-file-write'

export const RoutingHistoryRecordSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  workspace: z.string(),
  executionHost: z.string(),
  primaryAgent: z.custom<TuiAgent>(isTuiAgent),
  decision: AutomaticTaskDecisionSchema.optional(),
  action: z.enum(['keep-primary', 'generate', 'worker']),
  agentId: z.custom<TuiAgent>(isTuiAgent).optional(),
  modelId: z.string().optional(),
  thinkingLevel: z.string().optional(),
  reason: z.string().max(2000),
  error: z.string().max(2000).optional()
})
export type RoutingHistoryRecord = z.infer<typeof RoutingHistoryRecordSchema>
const queues = new Map<string, Promise<void>>()

export class AutomaticRoutingHistory {
  constructor(
    private readonly filePath = () =>
      path.join(getProfileUserDataPath(), 'automatic-task-routing.json')
  ) {}

  async list(): Promise<RoutingHistoryRecord[]> {
    try {
      return z
        .array(RoutingHistoryRecordSchema)
        .max(100)
        .parse(JSON.parse(await readFile(this.filePath(), 'utf8')))
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return []
      }
      throw error
    }
  }

  append(record: RoutingHistoryRecord): Promise<void> {
    const file = this.filePath()
    const next = (queues.get(file) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        const validated = RoutingHistoryRecordSchema.parse(record)
        const records = await this.list()
        await mkdir(path.dirname(file), { recursive: true })
        await writePluginFileAtomically(
          file,
          JSON.stringify([validated, ...records].slice(0, 100)),
          { mode: 0o600 }
        )
      })
    queues.set(file, next)
    void next
      .finally(() => {
        if (queues.get(file) === next) {
          queues.delete(file)
        }
      })
      .catch(() => undefined)
    return next
  }
}
