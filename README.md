# Latexdiff for VS Code

Generate `latexdiff` documents and compiled PDFs directly from VS Code.

This extension supports two comparison flows:

- Compare the active `.tex` file against Git history.
- Compare the active `.tex` file against another `.tex` file on disk, which is useful for folder-based versioning such as `v1/`, `v2/`, or archived drafts.

## Features

- Editor title button and status bar entry for LaTeX files.
- Quick pick flow for `HEAD`, recent commits, custom Git refs, or another file.
- Automatic PDF compilation with `latexmk`, `pdflatex`, or `tectonic`.
- Output isolation under a workspace-local `.latexdiff` directory by default.

## Requirements

The extension shells out to local tools. Install the tools you plan to use:

- `latexdiff`
- One compiler tool: `latexmk`, `pdflatex`, or `tectonic`
- `git` if you want Git-based comparisons

On macOS, the extension augments `PATH` with common TeX and package-manager locations such as `/Library/TeX/texbin`, `/opt/homebrew/bin`, and `/usr/local/bin`.

## Usage

1. Open a workspace that contains your `.tex` file.
2. Trust the workspace.
3. Open a LaTeX file.
4. Click the `Latexdiff` editor button or status bar button.
5. Choose one of:
   - `Compare with HEAD`
   - `Compare with Another Git Ref...`
   - `Compare with Another File...`

The extension writes generated artifacts to the configured output directory and opens the compiled PDF when compilation succeeds.

## Configuration

- `latexdiff.executablePath`
  Path to `latexdiff`. This is a machine-scoped setting and cannot be set by the workspace.
- `latexdiff.outputDirectory`
  Relative output directory inside the workspace. The extension rejects paths that escape the workspace folder.
- `latexdiff.compilerTool`
  Compiler used for PDF generation: `latexmk`, `pdflatex`, or `tectonic`.

## Security Model

- The extension is disabled in untrusted workspaces because it executes external tools.
- The output directory must resolve inside the current workspace.
- The `latexdiff` executable path is machine-scoped so the workspace cannot silently redirect it.

## Status

This extension is currently marked as preview while the command surface and release packaging settle.
