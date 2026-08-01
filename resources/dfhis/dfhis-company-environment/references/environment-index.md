# DFHIS Company Environment Index

Use the matching environment file under `company-environment/` when verification needs real internal endpoints or credentials.

| Environment | Reference file | Typical use |
| --- | --- | --- |
| 本地开发 | `company-environment/本地开发环境信息.md` | Local development verification and default HIS debugging. |
| 本地测试 | `company-environment/本地测试环境信息.md` | Test-environment validation before handoff. |
| 本地预发 | `company-environment/本地预发环境信息.md` | Pre-release validation and release-candidate checks. |
| 本地演示 | `company-environment/本地演示环境信息.md` | Demo scenario checks and presentation environment validation. |
| 本地标准库 | `company-environment/本地标准库环境信息.md` | Standard database comparison and baseline data checks. |
| 本地 152 开发 | `company-environment/本地152开发环境.md` | 152 development environment checks. |
| 本地 183 | `company-environment/本地183环境信息.md` | 183 environment checks. |
| 医共体公司开发 | `company-environment/医共体公司开发环境信息.md` | YGT/医共体 company development environment checks. |

Keep final reports credential-free: cite the environment name and validation outcome, not passwords or full secret-bearing connection strings.
