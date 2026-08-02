# Verification And Evidence

Use this reference for DFHIS runtime, UI, micro-frontend, authentication, and deployed-package verification. Keep `SKILL.md` as the workflow index and load this file only when the requirement needs these gates.

## Evidence record

Every material claim should carry:

- `type`: `runtime`, `build`, `test`, `e2e`, `database`, `deployment`, `smoke`, or `screenshot`.
- `status`: `passed`, `failed`, `blocked`, or `superseded`.
- `capturedAt`, `environment`, and `executionSurface` (shell, child app, browser, service, or database).
- `source`, `targetCommit` or package/hash, observation, and limitations.

Do not treat a command transcript, old screenshot, or git history as proof of a revised behavior. When a contract or material implementation changes, mark earlier evidence `superseded` and recapture the affected evidence from the final diff.

## UI and micro-frontend gate

1. Read the requirement contract and turn each UI claim into an observable check: position, width/right edge, row/column alignment, input-area geometry, visible text, route, or workflow state.
2. Prove the actual runtime owner. Trace shell route/menu/tab state, micro-frontend registration, mounted child path, entry HTML, hashed assets, and the concrete page route. A shell page or default `entry` alone is insufficient.
3. Capture network and DOM evidence for the child entry, `config.json` when present, JS/CSS assets, and a route/page chunk. Assert the qiankun container is visible and populated with the expected child root.
4. Use semantic selectors and assert the exact page or workflow state. Directly opening `/apps/<id>/...` is valid only after proving that the shell prepared the matching menu/tab/mount state, or when the child is explicitly the target surface.
5. Capture a screenshot of the business page, not only login, shell home, or a menu. Inspect it visually and record numeric geometry measurements where layout is part of acceptance. Reject blank mounts, stale assets, `Unexpected token '<'`, bootstrap/mount/CORS failures, and console errors from the changed child app.

The required loop is:

```text
implement
  -> focused self-test
  -> build/runtime refresh
  -> screenshot + DOM measurement
  -> visual inspection against the contract
  -> if mismatch: record defect, edit, and repeat
```

Build success with a wrong screenshot is a UI failure. A final verification must use the same final diff that will be reviewed, committed, pushed, or released.

## Authentication and environment evidence

- Prove the login contract: account, system/tenant/site, required fields, login response, active application, and menu permission. Do not replace integrated login with a token-only stub.
- Use approved environment references and read-only parameter/account checks to obtain credentials. Never guess, brute-force, scrape browser tokens, or write secrets into the repository.
- If a tool is missing, use the repository-selected runtime, an installed browser, a temporary isolated database driver, or a test-only shim. Auxiliary shims cannot replace the real child mount or business workflow.
- If three materially different safe approaches fail, stop with the exact blocker, evidence, and responsible owner/action. Do not repeat an unchanged deterministic command.

## Closeout

Before push or Yunxiao completion, review the final diff, rerun focused tests/builds, recapture the final screenshot/DOM evidence, stop temporary servers, release browser resources, and record residual environment limitations separately from product failures.
