---
name: his-workflow-harness
description: Run deterministic, evidence-driven HIS and DFHIS verification and release workflows. Use for HIS repository intake, Node/JDK/package-manager selection, local builds, read-only database checks, Jenkins compilation, deployment commands, online smoke checks, release verification, or any request to carry a HIS change from code through environment validation.
---

# HIS Workflow Harness

Use `scripts/his-workflow.mjs` as the executable backbone for general HIS work. Use the YGT skill and its own harness for `df-ygt-*` repositories.

## Intake

Run from this skill directory and point `--repo` at the isolated requirement worktree, never the original HIS aggregate source directory.

```bash
node scripts/his-workflow.mjs intake --repo /path/to/requirement/code/repo --json
```

Read the returned project family, runtime, package manager, detected build commands, and missing catalog fields before implementation or release work.

Resolution order:

1. Repository `.nvmrc`, `.node-version`, `.tool-versions`, `package.json#engines.node`, package manager declaration, lockfiles, wrappers, and Jenkinsfile.
2. Service entry from `--catalog` or `HIS_WORKFLOW_CATALOG`.
3. Project-family fallback: general HIS frontend uses Node 18; YGT uses its dedicated harness with Node 22 or repository-selected Node 24.

## Commands

```bash
node scripts/his-workflow.mjs doctor --repo <repo> --catalog <catalog> --service <id> --json
node scripts/his-workflow.mjs verify --repo <repo> --catalog <catalog> --service <id> --json
node scripts/his-workflow.mjs database --repo <repo> --catalog <catalog> --service <id> --json
node scripts/his-workflow.mjs jenkins --repo <repo> --catalog <catalog> --service <id> --allow-mutations --json
node scripts/his-workflow.mjs deploy --repo <repo> --catalog <catalog> --service <id> --allow-mutations --json
node scripts/his-workflow.mjs smoke --repo <repo> --catalog <catalog> --service <id> --json
node scripts/his-workflow.mjs full --repo <repo> --catalog <catalog> --service <id> --allow-mutations --report-dir <dir> --json
```

For a named company environment and an ad hoc Jenkins job, resolve the Chinese alias directly:

```bash
node scripts/his-workflow.mjs jenkins --repo <repo> --catalog <catalog> --environment "本地152开发环境" --job <job> --allow-mutations --json
```

- `doctor` records Git state and actual runtime versions.
- `verify` runs repository or catalog build/test commands with the selected Node directory first on `PATH`.
- `database` rejects non-read-only SQL and never prints connection secrets.
- `jenkins` triggers the mapped job and waits for a terminal result.
- `--environment` accepts a catalog ID or alias such as `本地152开发环境`; explicit process environment variables override catalog variables.
- `--job` supports a Jenkins job that has not yet been attached to a service entry.
- `deploy` only runs an explicit catalog command.
- `smoke` checks every mapped URL.
- `full` stops on the first failed stage and emits reusable evidence JSON/Markdown.
- `jenkins`, `deploy`, and `full` require `--allow-mutations`; this flag does not authorize unrelated Git or database writes.

Use `references/service-catalog.example.json` as the catalog contract. Keep real credentials in environment variables referenced by catalog entries, not in the catalog or skill.

## Evidence Gate

Put the report under the requirement directory, for example:

```bash
--report-dir "$YUNXIAO_REQUIREMENT_DIR/evidence/his-workflow"
```

Convert report evidence into `requirementContract.methodologyGate.verificationEvidence`:

- `runtime`: selected Node/JDK/package manager.
- `passing_test` and `build`: local verification.
- `database`: read-only business-data verification.
- `jenkins`: remote compile/package result and build URL.
- `deployment`: deployment or rollout result.
- `smoke`: online endpoint result.

Do not replace a required stage with `git diff --check`. If a catalog mapping is absent, record the exact missing service/environment field and stop that stage.

## Safety

- Run code changes in the Yunxiao requirement worktree created by `yunxiao-requirement-archiver`.
- Use `dfhis-company-environment` to choose the matching environment and catalog inputs.
- Keep database checks read-only. The harness accepts only SQL beginning with `SELECT`, `WITH`, `SHOW`, `DESCRIBE`, or `EXPLAIN`.
- Never include passwords or tokens in command arguments stored in reports. Pass them through environment variables.
- Use `his-release-merge` before this harness when the task is a release-branch cherry-pick batch.
- Run `selftest` after changing this skill:

```bash
node scripts/his-workflow.mjs selftest --json
```
