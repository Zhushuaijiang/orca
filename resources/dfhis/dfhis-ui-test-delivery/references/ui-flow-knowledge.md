# DFHIS UI flow knowledge

Treat entries as reusable candidates and revalidate visible UI in the selected environment.

## Browser-shell initialization

- The 152 shell reads `window.chrome.isDfHisLauncherStart` and otherwise probes `ws://127.0.0.1:17790/ws`.
- In the container, initialize `window.chrome.isDfHisLauncherStart = false` before navigation. This selects the real web fallback without faking a launcher, login, token, menu, or business context.
- A title plus HTTP 200 can still be a white screen when the launcher object is missing. Require visible body text and inspect the final screenshot.

## 病区护士站（120101）

### Login and ward selection

- URL candidate: `http://192.168.199.101:8015/`; prefer the current environment override, such as 152 at `http://192.168.1.151:8015/`.
- Login controls: `请输入账户/账号`, `请输入您的密码`, `请选择系统`, `【120101】病区护士站`, and `登 录`.
- The ward dialog is titled `选择病区`. Wait for it before choosing the currently visible exact `测试病区` or `测试病区2`; an immediate count can produce a false absence.

### Patient list tabs

- The `病人列表` page exposes `在院病人`, `出院病人`, `转科病人`, and `授权病人` entry tabs.
- For a rule in the shared patient operation handler, test direct `出院病人` and `转科病人` entry points when they expose the affected right-click action.

### Consultation query

- Navigation candidate: `菜单` → `会诊查询`; wait for `请输入患者姓名`.
- Historical data may require widening the first date input to `2026-03-01`, selecting exact status `发起`, and querying by patient name.
- DFHIS-31774 verified datum: `测试318`, inpatient number `26000034`, `zaiYuanZt=2`, consultation date 2026-03-18. Revalidate before reuse.

### Safe fee-entry assertion

- Right-click the patient row/card and choose exact `费用录入`.
- A blocking case must assert the prompt and absence of the fee-entry dialog or `/FeiYongLr` route.
- A regression case may open fee entry and close it without entering projects or clicking save, submit, or charge.

## DFHIS-31774 execution lessons

- `出院病人` is a direct patient-list tab. Its observed right-click menu did not contain `费用录入`; verify absence directly instead of expecting a post-click alert.
- For `转科病人`, widen visible `开始日期/结束日期`, select `转出/转入` as needed, then query.
- DevExtreme virtual grids can attach hidden duplicate rows. Scroll the target into view and reacquire a visible cell instead of blindly using `.first`.
- Verified blocked datum: `测试体温单 / 25007050 / zaiYuanZt=2`. Verified regression datum: `测试王 / 26000062 / zaiYuanZt=0`. Revalidate both before reuse.
- If no visible `zaiYuanZt=1` datum exists, keep the case collected and mark it skipped with the exact prerequisite; do not mutate the database to manufacture a pass.
- Run every case with safe reachable data. Report totals against generated cases, not only collected automated tests.
