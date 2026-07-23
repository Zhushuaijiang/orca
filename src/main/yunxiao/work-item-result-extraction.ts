export function extractWorkItemId(text: string): string | null {
  return text.match(/\bDFHIS-\d+\b/i)?.[0]?.toUpperCase() ?? null
}

export function extractYunxiaoUrl(text: string): string | null {
  return text.match(/https?:\/\/[^\s)）\]]*devops\.aliyun\.com[^\s)）\]]*/i)?.[0] ?? null
}

export function valueFromPath(value: unknown, path: string[]): string | null {
  let current = value
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return null
    }
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === 'string' && current.trim() ? current.trim() : null
}

export function extractWorkItemIdFromValue(value: unknown): string | null {
  const directPaths = [
    ['serialNumber'],
    ['result', 'identifier'],
    ['identifier'],
    ['result', 'serialNumber'],
    ['workItemId'],
    ['workitemId'],
    ['id'],
    ['result', 'workItemId'],
    ['result', 'workitemId'],
    ['result', 'id']
  ]
  for (const path of directPaths) {
    const found = valueFromPath(value, path)
    if (found) {
      return found
    }
  }
  return extractWorkItemId(JSON.stringify(value))
}

export function extractYunxiaoUrlFromValue(value: unknown): string | null {
  return extractYunxiaoUrl(JSON.stringify(value))
}

export function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}
