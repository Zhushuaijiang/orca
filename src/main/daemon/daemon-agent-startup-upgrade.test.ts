import { describe, expect, it } from 'vitest'
import { TUI_AGENT_CONFIG, isTuiAgent } from '../../shared/tui-agent-config'
import { createAdapter } from './daemon-pty-router-test-fixture'
import { DaemonPtyRouter } from './daemon-pty-router'
import { PREVIOUS_DAEMON_PROTOCOL_VERSIONS, PROTOCOL_VERSION } from './daemon-protocol-version'

describe('Windows agent startup daemon upgrade', () => {
  it('isolates the startup fix from existing v42 daemons', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThan(42)
    expect(PREVIOUS_DAEMON_PROTOCOL_VERSIONS).toContain(42)
  })

  it.each(Object.keys(TUI_AGENT_CONFIG).filter(isTuiAgent))(
    'starts %s on the new daemon and preserves existing sessions on v42',
    async (agent) => {
      const current = createAdapter('current', [], undefined, PROTOCOL_VERSION)
      const legacy = createAdapter('v42', ['existing-v42'], undefined, 42)
      const router = new DaemonPtyRouter({ current, legacy: [legacy] })
      await router.discoverLegacySessions()
      const startup = { cols: 120, rows: 40, command: `${agent} review`, launchAgent: agent }
      await router.spawn(startup)
      expect(current.spawn).toHaveBeenCalledExactlyOnceWith(startup)
      expect(legacy.spawn).not.toHaveBeenCalled()
      await router.spawn({ sessionId: 'existing-v42', attachOnly: true, cols: 80, rows: 24 })
      expect(legacy.spawn).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'existing-v42', attachOnly: true })
      )
      router.write('existing-v42', 'continue\r')
      expect(legacy.write).toHaveBeenCalledWith('existing-v42', 'continue\r')
    }
  )
})
