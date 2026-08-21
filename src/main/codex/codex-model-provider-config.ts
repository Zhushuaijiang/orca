import {
  createTomlLineScanState,
  getTomlTableHeader,
  isTomlStructuralLine,
  parseTomlSingleLineStringValue,
  parseTomlStringValue,
  updateTomlLineScanState
} from './config-toml-line-scan'

// Why: only the root setting selects the provider for every OAuth login;
// similarly named keys inside profiles or provider tables are not global pins.
export function readCodexTopLevelModelProvider(config: string): string | null {
  return readCodexTopLevelStringSetting(config, 'model_provider')
}

export function readCodexTopLevelModel(config: string): string | null {
  return readCodexTopLevelStringSetting(config, 'model')
}

function readCodexTopLevelStringSetting(config: string, key: string): string | null {
  let state = createTomlLineScanState()
  let lineOffset = 0
  for (const line of config.split('\n')) {
    if (isTomlStructuralLine(state)) {
      if (getTomlTableHeader(line)) {
        return null
      }
      const valueOffset = getTopLevelStringSettingValueOffset(line, key)
      if (valueOffset !== null) {
        return parseTomlStringValue(config, lineOffset + valueOffset)?.value ?? null
      }
    }
    state = updateTomlLineScanState(state, line)
    lineOffset += line.length + 1
  }
  return null
}

function getTopLevelStringSettingValueOffset(line: string, key: string): number | null {
  let index = 0
  while (line[index] === ' ' || line[index] === '\t') {
    index += 1
  }

  if (line.startsWith(key, index)) {
    index += key.length
  } else {
    const parsedKey = parseTomlSingleLineStringValue(line, index)
    if (parsedKey?.value !== key) {
      return null
    }
    index = parsedKey.end
  }

  while (line[index] === ' ' || line[index] === '\t') {
    index += 1
  }
  return line[index] === '=' ? index + 1 : null
}
