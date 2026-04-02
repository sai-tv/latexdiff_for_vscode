# Changelog

## 0.0.1

- Added editor title and status bar entry points for running latexdiff.
- Added Git ref comparison and file-to-file comparison workflows.
- Hardened workspace behavior for publishing:
  - disabled the extension in untrusted and virtual workspaces
  - validated that output stays inside the workspace
  - made the executable path machine-scoped
- Added release metadata, documentation, lint configuration, and test coverage for core path-handling helpers.
