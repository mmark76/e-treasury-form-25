# Project instructions

Before doing any work, read:

- `docs/AUDIT_BACKLOG.md`
- `docs/PRODUCT_SPEC.md`

General rules:

- Verify each finding against the current code before changing anything.
- Work on only one approved issue or pull request at a time.
- Do not attempt to fix the entire audit in one task.
- Do not make unrelated refactors.
- Add or update tests for every behavioral fix.
- Preserve the official Form 25 layout and rendering behavior.
- Preserve all existing `localStorage` data and keys during staged migration.
- Preserve existing field IDs unless an approved migration plan explicitly requires changing them.
- Do not remove existing functionality until its replacement has been implemented and tested.
- Use the agreed application title: `e-Treasury Form 25`.
- Never use or commit real customer data.
- Before implementation, explain the proposed changes, affected files, tests, risks, and acceptance criteria.
- Do not commit, push, open a pull request, or merge unless explicitly requested.
