import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { verificationKind } from './verification-kind.mjs'
import { detectVerifyCommands } from './his-project-runtime.mjs'

for (const [name, argv, expected] of [
  ['compile is not a test', ['/opt/gradle/bin/gradle', 'compileJava'], 'build'],
  ['lint is not a test', ['npm', 'run', 'lint'], 'command'],
  ['unknown node script is not a test', ['node', 'scripts/check.js'], 'command'],
  ['screenshot is not workflow proof', ['pnpm', 'run', 'e2e:screenshot'], 'screenshot'],
  ['unit test recognized', ['npm', 'run', 'test:unit'], 'passing_test'],
  ['windows gradle test recognized', ['C:\\gradle\\bin\\gradle.bat', ':app:test'], 'passing_test'],
  ['excluded test does not pass', ['./gradlew', 'test', '-x', 'test'], 'build'],
  ['maven skips do not pass', ['mvn', 'test', '-DskipTests'], 'build'],
  ['maven false skip still tests', ['mvn', 'test', '-DskipTests=false'], 'passing_test'],
  ['a path containing e2e is not e2e', ['node', '/e2e/tools/check.js'], 'command'],
  ['playwright install is not a test', ['playwright', 'install'], 'command'],
  ['playwright test is e2e', ['playwright', 'test'], 'e2e'],
  ['node built-in test', ['node', '--test', 'behavior.test.mjs'], 'passing_test'],
  [
    'build flag mentions test only as excluded',
    ['./gradlew', 'compileJava', '--exclude-task', 'test'],
    'build'
  ]
]) {
  test(name, () => assert.equal(verificationKind(argv), expected))
}

function commands(scripts) {
  const repo = mkdtempSync(path.join(tmpdir(), 'verify-detect-'))
  try {
    writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ scripts }))
    return detectVerifyCommands(repo, { hasPackageJson: true, packageManager: { name: 'npm' } })
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
}
test('test:unit-only repository is not skipped', () => {
  assert.deepEqual(commands({ 'test:unit': 'vue-cli-service test:unit' }), [
    ['npm', 'run', 'test:unit']
  ])
})
test('test alias avoids duplicate unit execution', () => {
  assert.deepEqual(commands({ 'test:unit': 'jest', test: 'npm run test:unit' }), [['npm', 'test']])
})
test('independent unit and integration scripts are preserved', () => {
  assert.deepEqual(commands({ 'test:unit': 'jest', test: 'node --test integration.mjs' }), [
    ['npm', 'run', 'test:unit'],
    ['npm', 'test']
  ])
})
test('placeholder test is omitted', () => {
  assert.deepEqual(commands({ test: 'echo "Error: no test specified" && exit 1' }), [])
})
test('external gradle runs tests instead of compile-only', () => {
  const result = detectVerifyCommands('/nonexistent-verify-repo', {
    hasGradle: true,
    gradleHome: '/tool/gradle'
  })
  assert.equal(result[0][1], 'test')
})
