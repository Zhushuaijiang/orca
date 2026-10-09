---
name: orca-auto-routing
description: >-
  Automatically choose Orca auxiliary agents and models for coding requests by task
  and difficulty. Applies to every Orca-managed coding agent, regardless of provider.
  Use for new user coding, investigation, design, review, testing, or documentation
  requests in an Orca-managed session.
---

# Automatic task routing

## Resolve the CLI for this session

Choose the executable once and reuse it for every later command:

- If the `ORCA_CLI_COMMAND` environment variable is set, use its value. Orca exports this
  for managed WSL sessions.
- Otherwise, in a dev checkout whose session exposes `ORCA_DEV_REPO_ROOT`, use `orca-dev`.
- Otherwise, on Linux outside an Orca-managed terminal, use `orca-ide`. Never run bare
  `orca` there — outside Orca's terminals it normally resolves to the
  GNOME Orca screen reader (`/usr/bin/orca`) and starts speech on the user's machine.
- Otherwise, use `orca`.

Below, `ORCA` is a placeholder for the executable you resolved. Substitute it before
running anything; do not create a shell variable or run `ORCA` literally. This works the
same way in POSIX shells, PowerShell, and cmd.exe.

If the selected executable cannot run, report its exact error and stop. Do not fall through
to another executable, which could silently target a different Orca build.

For new user coding, debugging, design, review, testing, and documentation tasks,
read the version-matched guide before routing:

```text
ORCA skills get orca-auto-routing
```

Resolve ORCA through the `orca-cli` discovery rules. Every coding agent uses the same
protocol. Routing must be enabled in Orca's Auxiliary models settings. Live dispatched
workers and `ORCA_AUXILIARY_REQUEST=1` helpers must not route or delegate again.

Prefer `--json`. Use the selected executable's `--help` for commands or flags the guide does
not cover. If a command reports that Orca is not running, start it with `ORCA open --json`
and retry. If it fails with `runtime_access_denied`, your sandbox blocked the connection:
re-run it with escalated permissions, and do not run `ORCA open` or restart Orca. If
`skills get` is unknown, explain that updating Orca restores the guide; use `--help` for
read-only discovery and do not guess unsupported commands.
