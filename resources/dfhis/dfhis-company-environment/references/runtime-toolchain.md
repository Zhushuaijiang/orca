# DFHIS Runtime Toolchain

Use this reference before frontend builds, Jenkins builds, dependency installs, or verification commands that depend on Node, npm, yarn, pnpm, Java, Gradle, or Maven versions.

## Selection Order

Choose the runtime in this order:

1. Repository-pinned version: `.nvmrc`, `.node-version`, `package.json#engines.node`, `package.json#volta.node`, `pnpm#packageManager`, `.npmrc`, `.yarnrc`, `.yarnrc.yml`, lockfile, or Jenkinsfile.
2. Workspace/project family evidence from path, repository name, package name, harness output, or environment document.
3. User-specified environment name in the prompt.
4. Fallback table below.

Do not override a repository-pinned version with the fallback table unless the pinned version is missing, malformed, or known to be stale for that repository.

## Fallback Node Versions

| Project family | Default Node | Evidence examples |
| --- | --- | --- |
| HIS / 云HIS / DFHIS frontend | Node 18 | `df-web-*`, non-YGT HIS frontend repositories, HIS Yunxiao requirements, local HIS environment builds |
| 医共体 / YGT frontend | Node 22 or Node 24 | `df-ygt-*`, `df-ygt-main`, YGT harness, 医共体 environment, YGT Jenkins jobs |

Backend Java builds must follow the repository Gradle/Maven wrapper and Jenkinsfile first. Use Node rules only for frontend/package steps in mixed repositories.

For 医共体/YGT repositories without a pinned Node version, prefer Node 22 for reproducible local builds. Use Node 24 when the repository, Jenkins job, user request, or existing installed toolchain explicitly points to Node 24.

## Local Shell Switching

Before install/build:

1. Print `pwd`, selected project family, selected Node version, and the evidence used.
2. Prefer the repository's own tool manager:
   - Volta: let `package.json#volta` select the runtime.
   - nvm: `nvm install <version>` then `nvm use <version>`.
   - fnm: `fnm install <version>` then `fnm use <version>`.
3. If no manager is available, fail clearly and report the required Node version. Do not run the build on the host default Node just to see what happens.
4. Run `corepack enable` when the repo uses pnpm or Yarn Berry, but avoid package metadata churn. If a tool modifies `package.json` only to auto-pin `packageManager`, revert that generated side effect unless the repository already expects it.
5. Use the lockfile package manager:
   - `pnpm-lock.yaml` -> pnpm
   - `yarn.lock` -> yarn
   - `package-lock.json` -> npm

## Jenkins Switching

For Jenkins builds:

- Select the Jenkins job from the requested environment and project family.
- Record the selected environment, branch, job name, project family, Node version, and evidence in the handoff.
- If the Jenkins job has its own Node parameter, set it to the selected version.
- If the Jenkins job does not expose Node selection, inspect Jenkinsfile/job docs when available and report the expected Node version before triggering.
- Do not trigger a build when the requested project family and selected job clearly disagree, such as YGT branch on a HIS-only Node 18 job, without user confirmation.

## Evidence Summary Format

Use this compact format in final or handoff text:

```text
Environment: 本地152开发环境
Project family: HIS frontend
Runtime: Node 18
Evidence: .nvmrc or fallback HIS rule
Command: <package-manager> <script>
Result: <summary>
```
