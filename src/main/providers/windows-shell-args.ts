import { win32 as pathWin32 } from 'node:path'
import { isWindowsGitBashShellPath } from '../git-bash'
import { parseWslPath, toLinuxPath, toWindowsWslPath } from '../wsl'
import {
  buildWslExecArgs,
  buildWslInteractiveLoginShellCommand
} from '../../shared/wsl-login-shell-command'
import { quotePosixShell } from '../../shared/shell-argument-quoting'
import { getBashWrapperLaunchArgs } from './local-pty-shell-ready'
import { ensureShellReadyWrappersAt } from './local-pty-shell-ready-wrapper-generation'
import { getPowerShellEncodedStartupCommand } from './windows-powershell-startup-command'
import { planWindowsCmdStartupCommand } from './windows-cmd-startup-command'

/** cmd.exe's own documented ceiling; callers that go through sshd budget below it. */
export { CMD_EXE_COMMAND_LINE_MAX_CHARS } from './windows-cmd-startup-command'
const CMD_UTF8_SETUP_COMMAND = 'chcp 65001 > nul'
export const ORCA_CODEX_LAUNCH_PREFLIGHT_CMD_QUOTE_ENV = 'ORCA_CODEX_LAUNCH_PREFLIGHT_CMD_QUOTE'
const CMD_CODEX_LAUNCH_PREFLIGHT = `if defined ORCA_CODEX_LAUNCH_PREFLIGHT call %${ORCA_CODEX_LAUNCH_PREFLIGHT_CMD_QUOTE_ENV}%%ORCA_CODEX_LAUNCH_PREFLIGHT%%${ORCA_CODEX_LAUNCH_PREFLIGHT_CMD_QUOTE_ENV}% agent hooks prepare-codex > nul 2>&1`
// Why: Git for Windows' bash inherits the ConPTY console's OEM code page
// (CP437), so a TUI that writes UTF-8 bytes straight to the console — agents
// like Claude Code use WriteFile, not WriteConsoleW — renders as mojibake
// (`❯` -> `Γ¥»`). Switch the console to UTF-8, then exec the normal interactive
// login shell; cmd.exe and PowerShell already do the equivalent. The `;` (not
// `&&`) keeps startup working even if chcp.com is missing.
const GIT_BASH_UTF8_LOGIN_COMMAND = 'chcp.com 65001 >/dev/null 2>&1; exec "$BASH" --login -i'

// Why every pane gets the rcfile: it defines the claude function that follows the selected
// account (and the codex wrapper), as bash panes elsewhere get; it sources the login chain itself.
function getGitBashLaunchCommand(): string {
  ensureShellReadyWrappersAt()
  const wrapperArgs = getBashWrapperLaunchArgs()
  if (!wrapperArgs) {
    return GIT_BASH_UTF8_LOGIN_COMMAND
  }
  const bashArgs = [...wrapperArgs, '-i']
    .map((arg) => (arg.startsWith('-') ? arg : quotePosixShell(arg.replace(/\\/g, '/'))))
    .join(' ')
  return `chcp.com 65001 >/dev/null 2>&1; exec "$BASH" ${bashArgs}`
}

/** Result of resolving a Windows shell to its launch args + effective cwd.
 *
 *  Why this module exists: both the in-process LocalPtyProvider and the
 *  daemon-subprocess spawner must produce IDENTICAL launch args for the same
 *  (shellPath, cwd) pair. A prior drift let the daemon path always spawn
 *  PowerShell regardless of which shell the user picked — the renderer's
 *  shellOverride never reached the daemon's shell-args branches. Sharing the
 *  decision here keeps both paths honest. */
export type WindowsShellLaunchArgs = {
  shellArgs: string[]
  /** True when the startup command was embedded in shellArgs and must not be
   *  written again through stdin. */
  startupCommandDeliveredInShellArgs?: boolean
  /** Command read by the shell bootstrap instead of typed into the terminal. */
  startupCommandEnv?: string
  /** The cwd node-pty should be spawned with. WSL cannot cd into a Windows
   *  path, so the wsl.exe branch returns the user's home as the effective cwd
   *  and injects `cd '<linux path>'` into shellArgs instead. */
  effectiveCwd: string
  /** The path the caller should still validate exists on disk. Equals cwd in
   *  every branch except wsl.exe (which validates the Windows cwd even though
   *  the shell itself launches from $HOME). */
  validationCwd: string
}

export type WindowsShellWslContext = {
  distro: string
  treatPosixCwdAsWsl?: boolean
}

/**
 * Builds wsl.exe arguments that enter the target directory through the distro shell.
 */
function buildWslShellArgs(linuxCwd: string, distro?: string): string[] {
  ensureShellReadyWrappersAt()
  const setupCommand = [
    `cd ${quotePosixShell(linuxCwd)}`,
    'export PATH="$HOME/.local/bin:$PATH"',
    buildWslInteractiveLoginShellCommand()
  ].join(' && ')
  // Why: WSL users often customize zsh rather than bash; launch the distro's
  // login shell so terminal PATH matches the environment Orca detects.
  return buildWslExecArgs(distro, ['sh', '-c', setupCommand])
}

/** Converts an MSYS drive spelling to the native cwd used by Windows terminal processes. */
export function normalizeWindowsTerminalCwd(cwd: string): string {
  const match = cwd.match(/^\/([A-Za-z])(?:\/(.*))?$/)
  if (!match) {
    return cwd
  }

  // Why: Git Bash/MSYS launch contexts can hand Windows terminals `/d/repo`;
  // ConPTY requires the equivalent native drive path as its cwd.
  const driveLetter = match[1].toUpperCase()
  const rest = match[2]?.replace(/\//g, '\\') ?? ''
  return rest ? `${driveLetter}:\\${rest}` : `${driveLetter}:\\`
}

/** Build the argv + effective cwd for a Windows shell launch.
 *
 *  - cmd.exe: `/K chcp 65001 > nul` so multi-byte CJK output renders correctly.
 *  - powershell.exe / pwsh.exe: dot-source $PROFILE and force UTF-8 I/O so
 *    oh-my-posh / starship / PSReadLine keep working. `-NoExit` alone would
 *    skip the profile.
 *  - wsl.exe: translate the Windows cwd to /mnt/<drive>/... and enter the
 *    distro user's login shell.
 *  - anything else: no args, same cwd. */
export function resolveWindowsShellLaunchArgs(
  shellPath: string,
  cwd: string,
  defaultCwd: string,
  wslContext?: WindowsShellWslContext,
  startupCommand?: string,
  codexLaunchPreflightCommand?: string
): WindowsShellLaunchArgs {
  const shellBasename = pathWin32.basename(shellPath).toLowerCase()
  const nativeCwd = normalizeWindowsTerminalCwd(cwd)

  if (shellBasename === 'cmd.exe') {
    const startupCommands = [
      CMD_UTF8_SETUP_COMMAND,
      ...(codexLaunchPreflightCommand ? [CMD_CODEX_LAUNCH_PREFLIGHT] : [])
    ]
    const startup = planWindowsCmdStartupCommand(startupCommand, startupCommands.join(' & '))
    if (startup.command) {
      startupCommands.push(startup.command)
    }
    return {
      shellArgs: ['/K', startupCommands.join(' & ')],
      ...(startup.command ? { startupCommandDeliveredInShellArgs: true } : {}),
      effectiveCwd: nativeCwd,
      validationCwd: nativeCwd
    }
  }

  if (shellBasename === 'powershell.exe' || shellBasename === 'pwsh.exe') {
    const powerShellCommand = getPowerShellEncodedStartupCommand(nativeCwd, startupCommand)
    // Why: foreground-process status on Windows depends on OSC 133 C/D, and
    // PowerShell needs a prompt/readline bootstrap after profiles finish.
    // Why base64 and not -Command: see powershell-osc133-bootstrap.ts (MDE review).
    return {
      shellArgs: ['-NoLogo', '-NoExit', '-EncodedCommand', powerShellCommand.encodedCommand],
      ...(powerShellCommand.startupCommandDeliveredInShellArgs
        ? { startupCommandDeliveredInShellArgs: true }
        : {}),
      ...(powerShellCommand.startupCommandEnv !== undefined
        ? { startupCommandEnv: powerShellCommand.startupCommandEnv }
        : {}),
      effectiveCwd: nativeCwd,
      validationCwd: nativeCwd
    }
  }

  if (isWindowsGitBashShellPath(shellPath)) {
    return {
      shellArgs: ['-c', getGitBashLaunchCommand()],
      effectiveCwd: nativeCwd,
      validationCwd: nativeCwd
    }
  }

  if (shellBasename === 'wsl.exe') {
    const wslInfo = parseWslPath(cwd)
    if (wslInfo) {
      return {
        shellArgs: buildWslShellArgs(wslInfo.linuxPath, wslInfo.distro),
        effectiveCwd: defaultCwd,
        validationCwd: cwd
      }
    }
    if (wslContext?.treatPosixCwdAsWsl && cwd.startsWith('/')) {
      return {
        shellArgs: buildWslShellArgs(cwd, wslContext.distro),
        effectiveCwd: defaultCwd,
        validationCwd: toWindowsWslPath(cwd, wslContext.distro)
      }
    }
    const driveMatch = nativeCwd.replace(/\\/g, '/').match(/^([A-Za-z]):\/?(.*)$/)
    const linuxCwd = driveMatch ? toLinuxPath(nativeCwd) : '/mnt/c'
    return {
      shellArgs: buildWslShellArgs(linuxCwd, wslContext?.distro),
      effectiveCwd: defaultCwd,
      validationCwd: nativeCwd
    }
  }

  return {
    shellArgs: [],
    effectiveCwd: nativeCwd,
    validationCwd: nativeCwd
  }
}
