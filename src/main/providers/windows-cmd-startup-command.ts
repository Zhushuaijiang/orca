export const CMD_EXE_COMMAND_LINE_MAX_CHARS = 8191
export class WindowsCmdStartupCommandError extends Error {}

export function planWindowsCmdStartupCommand(
  command: string | undefined,
  prefix: string
): { command?: string } {
  if (!command) {
    return {}
  }
  if (
    prefix.length + command.length + 3 > CMD_EXE_COMMAND_LINE_MAX_CHARS ||
    /[\r\n\0]/.test(command)
  ) {
    throw new WindowsCmdStartupCommandError(
      'cmd.exe cannot run this startup command intact. Select PowerShell for long or multiline agent prompts.'
    )
  }
  return { command }
}

export function windowsPtyShellArgs(
  shellPath: string,
  args: string[],
  platform: NodeJS.Platform = process.platform
): string[] | string {
  const name = shellPath.replace(/\\/g, '/').split('/').pop()?.toLowerCase()
  // cmd parses its own command line; node-pty's argv encoder would backslash-escape its quotes.
  return platform === 'win32' &&
    (name === 'cmd.exe' || name === 'cmd') &&
    args[0] === '/K' &&
    args.slice(1).some((arg) => arg.includes('"') || arg.length > 6000)
    ? `/K ${args.slice(1).join(' ')}`
    : args
}
