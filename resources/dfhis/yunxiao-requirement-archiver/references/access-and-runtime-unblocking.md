# Access And Runtime Unblocking

Use this reference when an approved verification path is blocked by credentials, shell access, a child-app mount, missing tooling, or a stale runtime. The objective is to change the hypothesis or evidence surface, not to loop on the same failure.

## Bounded recovery loop

1. Write the exact failure and classify it as credential, permission, routing/proxy, mount/base-path, dependency/toolchain, data, or stale package.
2. Choose one safe fallback that tests a different hypothesis and record command, result, and next action.
3. Do not repeat the same deterministic command unchanged. After three materially different safe attempts, stop and report the exact gate and owner.

Never bypass a gate by inventing a password, brute-forcing, scraping tokens, disabling security broadly, modifying production data, or committing secrets.

## Credential source order

Use, in order:

1. Credentials already injected by DFHIS Setup, the current process, Orca environment configuration, or an approved secret store.
2. The matching company-environment reference and its approved read-only parameter/account lookup.
3. An existing authorized SSO/OAuth session or test account with the required application permission.
4. An approved read-only account/permission check by an administrator.
5. Ask the user or environment owner for the missing credential, permission, system, tenant, or site choice.

Use secrets only in the current process or ignored local input. Do not print them, store them in reports, or put them in command arguments that become durable logs.

## Online shell and local child app

- Keep the online shell as the shell. Trace its real menu, tab, `viewList`, qiankun container, and child registration before opening a child route.
- Resolve the actual child entry, `config.json`, HTML, hashed assets, and concrete route. Mount the local child only at the exact deployed path (for example `/apps/<app-code>/`) using a test-only interception or approved dev configuration.
- Verify that the browser requested the local entry and its assets, the container is visible and populated, the page route is concrete, and the loaded assets contain the target keywords or commit/package marker.
- A blank child, HTML returned as JavaScript (`Unexpected token '<'`), or a shell home page usually means wrong mount path, base URL, externals, or menu state. Fix that hypothesis and recapture evidence.
- Complete the real login and system/application selection. Token injection may help isolate an unrelated auth problem, but it is not integrated E2E proof.

## Tool fallbacks and cleanup

- Use the harness-selected Node/JDK/package manager before changing versions.
- Prefer an installed browser and a temporary isolated cache over adding browser dependencies to the product repository.
- If `psql`, `mysql`, Docker, or a vendor driver is missing, use an approved existing driver or temporary runtime for read-only checks; remove temporary files and do not add dependencies for one verification.
- Use a test shim only to isolate a known external dependency. Keep the real mount, route, and business assertions in the final pass.
- Stop temporary servers, close browser tabs/contexts, remove test overrides, release ports, and confirm the final browser is loading the intended package.

## Attempt ledger

Record a compact ledger with `failure`, `hypothesis`, `route/tool`, `result`, and `next owner/action`. This makes progress visible and prevents returning to an already disproved route. Final evidence must state environment, execution surface, target commit/package, and remaining limitations.
