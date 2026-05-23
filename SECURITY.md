# Security

## Reporting vulnerabilities

If you discover a security issue, please report it privately (for example via GitHub Security Advisories on the repository) rather than opening a public issue.

## Cursor API keys

This app can store a **Cursor API key** for the in-app assistant:

- Keys are only accepted on **localhost** (`127.0.0.1`).
- Keys saved in the UI are encrypted (AES-256-GCM) under `~/.curmap/` with restrictive file permissions.
- Alternatively, set `CURSOR_API_KEY` in a local `.env` file (never commit `.env`).

**Do not** commit API keys, `.env` files, or encrypted credential files from your home directory.

## Your map data

Maps live as JSON in `curmaps/`. They may contain notes and labels you consider private. Review that folder before pushing to a public repository.
