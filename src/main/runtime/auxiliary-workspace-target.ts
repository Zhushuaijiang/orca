import type { GlobalSettings } from '../../shared/global-settings-types'
import { parseWorkspaceKey } from '../../shared/workspace-scope'
import { isFloatingWorkspaceSelector } from '../../shared/floating-workspace-worktree'
import type { RuntimeGitTarget } from './runtime-git-command-target'

export async function resolveAuxiliaryWorkspaceTarget(
  selector: string,
  host: {
    resolveFileTarget: (selector: string) => Promise<RuntimeGitTarget>
    resolveGitTarget: (selector: string) => Promise<RuntimeGitTarget>
    getWindowsRuntime: () => GlobalSettings['localWindowsRuntimeDefault'] | undefined
  },
  platform: NodeJS.Platform = process.platform
): Promise<RuntimeGitTarget> {
  const target = await host.resolveFileTarget(selector)
  if (
    parseWorkspaceKey(target.worktree.id)?.type !== 'folder' &&
    !isFloatingWorkspaceSelector(selector)
  ) {
    return host.resolveGitTarget(selector)
  }
  const runtime = host.getWindowsRuntime()
  if (target.executionHostId === 'local' && platform === 'win32' && runtime?.kind === 'wsl') {
    if (!runtime.distro) {
      throw new Error('Select a WSL distribution before running this auxiliary task.')
    }
    return { ...target, localGitOptions: { wslDistro: runtime.distro } }
  }
  return target
}
