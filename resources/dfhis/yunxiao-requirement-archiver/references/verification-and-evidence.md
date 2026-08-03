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

## Local screenshot capture recipe

For DFHIS qiankun frontends, do not conclude "the sub-app cannot render locally". Stand up the local stack against the 152 environment:

- Run three dev servers together: the main portal `df-web-main` (default `:9000`, proxying the 152 gateway `192.168.1.151:9000`), the target sub-app (for example `df-web-zhushujugl` on `:8033`; in dev mode the portal's `src/config/apps/apps.dev.js` loads the child from localhost), and the shared module `df-web-bui` (`:8034`). Without `df-web-bui` the portal bootstrap fails and pages stay blank.
- Legacy webpack frontends need Node 18 with `export NODE_OPTIONS=--openssl-legacy-provider`.
- Capture with `playwright-core` installed under `{需求目录}/e2e/` (never in the product repo): `chromium.launch({ channel: 'chrome', headless: true })` reuses the installed Chrome, so no browser download is needed. Orca computer-use is an alternative only when `orca computer permissions --json` shows Accessibility and Screen Recording granted; otherwise do not loop on `permission_denied`.
- Login with the 152 万能密码 obtained through the approved read-only parameter lookup (see `dfhis-company-environment`), kept in an ignored local credential file and never echoed. The login account must be the employee 工号 (for example `DBA`, resolved from `gy_zhigongxx`); Chinese display names fail.
- Playwright pitfalls seen in practice: remove blocking overlays (`.df-utils-message-wrapper`, `.el-message`, `.v-modal`) via injected JS before clicking; add explicit waits for slow system-list drawers and qiankun mounts; pass strings instead of closures into `page.evaluate`; if row click/dblclick does not open an edit drawer, open the same dialog component through the `新增` button.

## Screenshot upload and Yunxiao comment

Self-test screenshots are delivery evidence and must reach the work item:

1. Copy final images to `{需求目录}/evidence/screenshots/` with DFHIS-id-prefixed descriptive names.
2. Compress each image; the Yunxiao MCP rejects large request bodies with `HTTP 413 Payload Too Large`. Use `sips -Z 1100 -s format jpeg -s formatOptions 45 in.png --out out.jpg` (`-s pixelsWide` combined with `-s format` silently writes nothing).
3. Upload with `scripts/upload_yunxiao_attachment.py --requirement-dir {需求目录} --file {image}`; it returns `attachmentId` and an `embedMarkdown` image link.
4. Post a comment whose body embeds those `embedMarkdown` links via `scripts/comment_yunxiao.py`, so the images render inline on the work item, and record the attachment/comment ids in the handoff document.


## Authentication and environment evidence

- Prove the login contract: account, system/tenant/site, required fields, login response, active application, and menu permission. Do not replace integrated login with a token-only stub.
- Use approved environment references and read-only parameter/account checks to obtain credentials. Never guess, brute-force, scrape browser tokens, or write secrets into the repository.
- If a tool is missing, use the repository-selected runtime, an installed browser, a temporary isolated database driver, or a test-only shim. Auxiliary shims cannot replace the real child mount or business workflow.
- If three materially different safe approaches fail, stop with the exact blocker, evidence, and responsible owner/action. Do not repeat an unchanged deterministic command.

## Closeout

Before push or Yunxiao completion, review the final diff, rerun focused tests/builds, recapture the final screenshot/DOM evidence, stop temporary servers, release browser resources, and record residual environment limitations separately from product failures.
