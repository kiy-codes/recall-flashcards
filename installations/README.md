# Recall Flashcards installations

This folder holds local copies of published installation packages. Each release uses its own versioned subfolder, for example `installations/1.3.1/`, containing packages, `RELEASE-NOTES.md`, and `SHA256SUMS.txt`.

Download public packages from [GitHub Releases](https://github.com/kiy-codes/recall-flashcards/releases). Windows users should normally choose the setup EXE. Releases also include portable and alternative Windows formats, Linux packages, and macOS Intel and Apple Silicon packages.

Versioned subfolders are ignored by Git because installer binaries are distributed as release assets. Build output stays in the existing `release-<version>/` folders until the verified packages are collected here. Older installation packages are preserved.
