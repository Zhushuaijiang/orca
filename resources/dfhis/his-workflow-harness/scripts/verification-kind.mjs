// Classify recognized verification tasks conservatively, never unknown commands as tests.
import path from 'node:path'

export function verificationKind(argv) {
  if (!Array.isArray(argv) || !argv.length) {
    return 'command'
  }
  const exe = path.win32
    .basename(String(argv[0]).replaceAll('/', '\\'))
    .replace(/\.(?:cmd|bat|exe)$/i, '')
    .toLowerCase()
  let tasks = []
  if (['npm', 'pnpm', 'yarn'].includes(exe)) {
    tasks = [argv[1] === 'run' ? argv[2] : argv[1]]
  } else if (['gradle', 'gradlew', 'mvn', 'mvnw'].includes(exe)) {
    // Skip flag values too; they must not manufacture evidence of an unexecuted task.
    for (let i = 1; i < argv.length; i++) {
      const token = String(argv[i])
      if (
        [
          '-x',
          '--exclude-task',
          '-P',
          '--projects',
          '-pl',
          '-f',
          '--file',
          '-I',
          '--init-script',
          '--tests'
        ].includes(token)
      ) {
        i++
        continue
      }
      if (!token.startsWith('-')) {
        tasks.push(token.split(':').at(-1))
      }
    }
    if (
      argv.some((x) =>
        /^(?:-DskipTests(?:=true)?|-Dmaven\.test\.skip(?:=true)?|--exclude-task=test|-x=test)$/.test(
          String(x)
        )
      ) ||
      argv.some(
        (x, i) => ['-x', '--exclude-task'].includes(x) && /(?:^|:)test$/.test(String(argv[i + 1]))
      )
    ) {
      return 'build'
    }
  } else if (['jest', 'vitest'].includes(exe)) {
    return 'passing_test'
  } else if (exe === 'node' && argv.includes('--test')) {
    return 'passing_test'
  } else if (['playwright', 'cypress'].includes(exe)) {
    return argv.includes('test') || argv.includes('run') ? 'e2e' : 'command'
  } else {
    return 'command'
  }
  tasks = tasks.filter((x) => typeof x === 'string')
  if (tasks.some((x) => /screenshot|visual/i.test(x))) {
    return 'screenshot'
  }
  if (
    tasks.some((x) => /^(?:e2e|test:e2e|test:playwright|playwright|cypress:run|cy:run)$/.test(x))
  ) {
    return 'e2e'
  }
  if (tasks.some((x) => /^(?:test|test:unit|test:integration|unitTest|integrationTest)$/.test(x))) {
    return 'passing_test'
  }
  if (
    tasks.some((x) =>
      /^(?:build(?::[\w-]+)?|compileJava|compileTestJava|compile|package|assemble|classes)$/.test(x)
    )
  ) {
    return 'build'
  }
  return 'command'
}
