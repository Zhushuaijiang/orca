import { createServer, type IncomingMessage, type Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getYunxiaoWorkItemDetail, updateYunxiaoWorkItemDescription } from './work-item-detail'

type RecordedCall = { name: string; args: Record<string, unknown> }
type ToolReply = { text?: unknown; error?: string }

let server: Server | null = null
let calls: RecordedCall[] = []
let reply: (call: RecordedCall) => ToolReply = () => ({ text: '' })
const originalEnv = { ...process.env }

function asRecord(value: unknown): Record<string, unknown> {
  // SAFETY: every caller only reads known string keys, and non-objects map to an empty record.
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function jsonrpcResult(id: unknown, result: unknown): unknown {
  return { jsonrpc: '2.0', id, result }
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function startFakeMcp(): Promise<void> {
  server = createServer((request, response) => {
    void (async () => {
      const body = asRecord(JSON.parse(await readBody(request)) as unknown)
      const method = typeof body.method === 'string' ? body.method : ''
      if (method === 'initialize') {
        response.setHeader('Mcp-Session-Id', 'session-1')
        response.setHeader('Content-Type', 'application/json')
        response.end(
          JSON.stringify(
            jsonrpcResult(body.id, {
              protocolVersion: '2025-03-26',
              capabilities: {},
              serverInfo: { name: 'fake-yunxiao', version: '0.0.0' }
            })
          )
        )
        return
      }
      if (method === 'notifications/initialized') {
        response.statusCode = 202
        response.end()
        return
      }
      if (method === 'tools/call') {
        const params = asRecord(body.params)
        const name = typeof params.name === 'string' ? params.name : ''
        const args = asRecord(params.arguments)
        calls.push({ name, args })
        const next = reply({ name, args })
        response.setHeader('Content-Type', 'application/json')
        response.end(
          JSON.stringify(
            next.error
              ? { jsonrpc: '2.0', id: body.id, error: { code: -32000, message: next.error } }
              : jsonrpcResult(body.id, {
                  content: [{ type: 'text', text: String(next.text ?? '') }]
                })
          )
        )
        return
      }
      response.statusCode = 400
      response.end()
    })()
  })
  await new Promise<void>((resolve) => {
    server?.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  process.env.YUNXIAO_MCP_URL = `http://127.0.0.1:${port}/mcp`
  process.env.YUNXIAO_ACCESS_TOKEN = 'test-token'
  process.env.YUNXIAO_ORGANIZATION_ID = 'org-1'
  process.env.YUNXIAO_ASSIGNEE_ID = 'assignee-1'
}

beforeEach(async () => {
  calls = []
  reply = () => ({ text: '' })
  await startFakeMcp()
})

afterEach(async () => {
  process.env = { ...originalEnv }
  await new Promise<void>((resolve, reject) => {
    if (!server) {
      resolve()
      return
    }
    server.close((error) => (error ? reject(error) : resolve()))
  })
  server = null
})

describe('getYunxiaoWorkItemDetail', () => {
  it('unwraps a rich-text description and derives the DFHIS page url', async () => {
    reply = () => ({
      text: JSON.stringify({
        serialNumber: 'DFHIS-32792',
        subject: '组套卫材维护',
        description: JSON.stringify({ htmlValue: '<p>第一段</p><p>第二段</p>' })
      })
    })

    const detail = await getYunxiaoWorkItemDetail({ workItemIdOrUrl: 'DFHIS-32792' })

    expect(detail).toEqual({
      ok: true,
      workItemId: 'DFHIS-32792',
      subject: '组套卫材维护',
      description: '第一段\n第二段',
      url: 'https://devops.aliyun.com/projex/req/DFHIS-32792'
    })
    expect(calls[0]).toEqual({
      name: 'get_work_item',
      args: { organizationId: 'org-1', workItemId: 'DFHIS-32792' }
    })
  })

  it('accepts a work item URL and asks for the extracted id', async () => {
    reply = () => ({ text: JSON.stringify({ serialNumber: 'DFHIS-1', subject: 'x' }) })

    await getYunxiaoWorkItemDetail({
      workItemIdOrUrl: 'https://devops.aliyun.com/projex/req/DFHIS-1'
    })

    expect(calls[0]?.args.workItemId).toBe('DFHIS-1')
  })

  it('reports a transport error instead of returning an empty item', async () => {
    reply = () => ({ error: 'Yunxiao API error (403): forbidden' })

    const detail = await getYunxiaoWorkItemDetail({ workItemIdOrUrl: 'DFHIS-2' })

    expect(detail.ok).toBe(false)
    if (!detail.ok) {
      expect(detail.error).toContain('403')
    }
  })
})

describe('updateYunxiaoWorkItemDescription', () => {
  it('sends the markdown payload the MCP expects', async () => {
    reply = () => ({ text: '{"ok":true}' })

    const result = await updateYunxiaoWorkItemDescription({
      workItemIdOrUrl: 'DFHIS-32792',
      description: '新稿\n\n---\n**原始需求（深化前，留档）**\n\n旧稿'
    })

    expect(result).toEqual({ ok: true, workItemId: 'DFHIS-32792' })
    expect(calls[0]).toEqual({
      name: 'update_work_item',
      args: {
        organizationId: 'org-1',
        workItemId: 'DFHIS-32792',
        updateWorkItemFields: {
          description: '新稿\n\n---\n**原始需求（深化前，留档）**\n\n旧稿',
          formatType: 'MARKDOWN'
        }
      }
    })
  })

  it('surfaces a write failure so the dialog keeps the draft', async () => {
    reply = () => ({ error: 'Yunxiao API error (404): 工作项id错误或不存在' })

    const result = await updateYunxiaoWorkItemDescription({
      workItemIdOrUrl: 'DFHIS-0',
      description: '新稿'
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('不存在')
    }
  })

  it('rejects an empty description without calling the server', async () => {
    const result = await updateYunxiaoWorkItemDescription({
      workItemIdOrUrl: 'DFHIS-1',
      description: '   '
    })

    expect(result.ok).toBe(false)
    expect(calls).toEqual([])
  })

  it('rejects a missing work item id without calling the server', async () => {
    const result = await updateYunxiaoWorkItemDescription({
      workItemIdOrUrl: '',
      description: '新稿'
    })

    expect(result.ok).toBe(false)
    expect(calls).toEqual([])
  })
})
