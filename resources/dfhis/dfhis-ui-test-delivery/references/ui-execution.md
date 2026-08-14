# Safe UI execution

- Confirm URL, account, system, department/ward, and safe subject before execution.
- Prefer existing records and read-only queries; never change production-like data to fit a case.
- Prefer role, label, placeholder, exact scoped text, then stable application attributes.
- Capture the decisive assertion and a failure screenshot; close the context to finalize video.
- In a pure browser container, initialize `window.chrome.isDfHisLauncherStart = false` before navigation; this selects the web fallback without faking launcher commands, login, or tokens.
- Redact passwords, tokens, cookies, and authorization headers from logs and network evidence.
- Stop before Save, Submit, Charge, Dispense, Refund, or another mutation without explicit authority, a named test subject, and cleanup.
