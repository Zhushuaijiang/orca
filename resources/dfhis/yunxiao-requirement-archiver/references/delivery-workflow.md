# Yunxiao code delivery workflow

Read this file only when a requirement is ready for code edits or delivery.

## Prepare and edit

1. Confirm `PRD_AND_CODE_ANALYSIS.md` has a non-blocked contract, current evidence, affected repositories, exact files/symbols, implementation plan, and acceptance checks.
2. Resolve each remote from an existing local clone. Use `prepare_local_worktree.py` to create `{requirement_dir}/code/<repo>` on `hotfix-DFHIS-12345` for a bug or `feature-DFHIS-12345` for a requirement. Do not copy a server checkout.
3. Immediately before an edit, run:

   ```bash
   python3 scripts/guard_code_edit.py --requirement-dir /path/to/DFHIS-12345 /exact/file
   ```

4. Implement the smallest evidence-backed change. Keep requirement ids out of production identifiers; use business names.
5. Add focused unit/regression tests for the changed branches. Use `his-workflow-harness` to select Node/JDK/package manager and run tests plus build. Record commands, runtime versions, scenario count, and results.

## Evidence by change type

- Any code: `passing_test` plus actual runtime version.
- Frontend/workflow: build plus final-page screenshots; inspect the images before upload.
- Backend/API: focused tests plus compile/build.
- SQL/data/config/parameter/dictionary: validate and upload the exact patch; mark `数据变更`.
- Clinical semantics or mandatory HIS MCP case: `business` evidence.
- Release requested: local build plus Jenkins, deployment, and smoke evidence.

Code review is not runtime evidence. If a material edit follows verification, rerun affected checks and replace superseded evidence.

## Commit and push

For todo-pool claims, the commit message is exactly the claim's full Yunxiao URL. Push the explicit requirement branch and verify upstream tracking with `git status -sb`.

Do not push a shared RC branch. Do not change build definitions or a project-local API module to bypass unpublished shared contracts.

## Yunxiao closeout

1. For SQL/data/config and UI screenshots, upload the exact files with `upload_yunxiao_attachment.py` and verify attachment name/size/id.
2. Post a comment with `comment_yunxiao.py` containing repo, branch, commit, changed files, fix summary, test/build evidence, screenshot links when relevant, and the handoff path.
3. Read current custom fields before writing. For incremental deliveries use `--append-client`, `--append-server`, or `--append-data`; never replace existing entries with `无`.
4. Run `update_yunxiao_completion_fields.py`; set only fields matching actual changes, preserve participants, move to `开发测试`, and require read-back verification.
5. Keep final acceptance separate from delivery. Before release use `code_pushed_pending_release_validation`; after release verify the deployed child bundle and UI. Missing post-release evidence does not erase completed code delivery, but it does block a claim of final production acceptance.

Any failed comment, attachment, field update, or read-back leaves that closeout step incomplete. Report the exact error and remaining owner.
