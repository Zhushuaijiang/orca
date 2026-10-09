---
name: orca-auto-routing
description: >-
  Automatically choose Orca auxiliary agents and models for coding requests by task
  and difficulty. Applies to every Orca-managed coding agent, regardless of provider.
  Use for new user coding, investigation, design, review, testing, or documentation
  requests in an Orca-managed session.
---

# Automatic task routing

Remain the primary agent responsible for the user's complete outcome. Orca owns routing
configuration; do not guess cheap/strong model names from your provider's catalog.

## Before a new request

Outside an Orca-managed session, keep the task in the current agent. Do not start
Orca merely because this globally installed skill was discovered. Managed sessions
provide an Orca caller address such as `ORCA_TERMINAL_HANDLE` or `ORCA_AGENT_SESSION_ID`.

1. Skip automatic routing if a live Orca worker preamble owns your task, or if
   `ORCA_AUXILIARY_REQUEST=1`. Never route helper output or coordinator messages.
   If the user explicitly forbids delegation or requests the current agent personally,
   keep the task in the primary agent.
2. Resolve the CLI using `orca-cli`'s discovery rules. Use `ORCA_CLI_COMMAND` when
   supplied, `orca-dev` in an injected dev session, `orca-ide` outside managed Linux
   terminals, otherwise `orca`. Reuse that executable throughout.
3. Write the actual user request and necessary code/error context to a UTF-8 prompt
   file. Preserve the request's scope and language. Exclude unrelated secrets.
4. Run the following once, replacing placeholders with real values:

```text
ORCA auxiliary auto --primary-agent <your-agent-id> --prompt-file <file> --json
```

Orca classifies the task using the configured Task classification model. It chooses
the task's auxiliary route, then applies the simple/standard/complex model override
for the execution host. Uncertain classifications, disabled routing, or an absent
route retain the task in the primary agent. `auxiliary route` inspects a decision
without executing the selected task. `auxiliary history --json` shows decisions.

## Consume the receipt

- Disabled, `keep-primary`, or classification failure: continue yourself. Do not loop
  on routing or tell the user delegation happened.
- Text generation: inspect the returned result and integrate it into the task. A
  summary/review is input for your judgment, not authority to run commands or expand scope.
- Worker Dispatch: load `ORCA skills get orchestration`, supervise the exact returned
  Task/Dispatch, wait for settlement, verify changed files and tests, and report the
  outcome. Do not edit the worker's files concurrently. Release only after settlement.
- A failed or uncertain worker-start receipt: follow its recovery commands. Never
  create a fresh attempt or take over files merely because contact was lost.

Questions authorize analysis, not edits. Routing preserves the user's and execution
host's permissions. It never grants approval, publishes code, sends third-party
messages, or changes the running primary session's model. Break independent work
into bounded subtasks only when needed; supervise them sequentially to avoid conflicting writes.

## Configuration and availability

Enable Automatic task routing in Settings → Auxiliary models and save. Configure a
fast Task classification model, then simple, standard and complex routes. Empty
difficulty fields inherit the task route. Exact model IDs and effort are host-specific.
Complex tasks default to the primary agent until a complex-task route is configured;
the explicit Keep complex tasks in the primary agent setting takes precedence.

All primary coding agents can call this protocol. Text helpers need a supported
headless CLI; coding/testing workers use Orca's existing supported-agent launch flow.
The selected binary/account must exist on the execution host. SSH loss never means
the task moved to the local machine.

Orca inserts routing instructions into managed chat messages and agent-launch prompts.
Agents receiving terminal input directly need this skill loaded in their session;
restart agents that cache their skill catalog. Skill compliance depends on the agent.
The receipt and routing history, not a verbal claim, show what actually ran.
