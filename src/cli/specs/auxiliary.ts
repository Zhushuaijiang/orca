import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const AUXILIARY_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['auxiliary', 'run'],
    summary: 'Run a task with its configured auxiliary agent and model',
    usage: 'orca auxiliary run <task> --prompt <text> [--worktree <selector>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'task',
      'prompt',
      'prompt-file',
      'worktree',
      'image',
      'primary-agent'
    ],
    positionalArgs: ['task'],
    repeatableFlags: ['image'],
    notes: [
      'Use --prompt-file to read a UTF-8 prompt from a local file.',
      'The selected workspace host executes the task. Older hosts must be updated to support auxiliary.generate.',
      'Git repair tasks and guarded skill maintenance use their existing workflows.'
    ],
    examples: [
      'orca auxiliary run decomposition --prompt "Plan the migration"',
      'orca auxiliary run review --prompt-file changes.txt --worktree active --json',
      'orca auxiliary run vision --image /workspace/screen.png --prompt "Describe this screen"'
    ]
  }
]
