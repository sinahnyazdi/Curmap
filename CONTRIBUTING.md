# Contributing

Thanks for your interest in improving this project.

## Development setup

```bash
pnpm install
cp .env.example .env   # optional, for CURSOR_API_KEY
pnpm run dev
```

- UI: http://localhost:5173
- API: http://localhost:3847

## Checks

```bash
pnpm run typecheck
pnpm run build
```

## Curmap data

- Sample map: `curmaps/example.json`
- Schema and agent workflow: [AGENTS.md](./AGENTS.md)
- CLI: `pnpm run curmap -- --help`

When changing the JSON schema, update `shared/schema.ts` and any CLI/import/export paths that depend on it.

## Pull requests

- Keep changes focused.
- Match existing TypeScript and React patterns in `src/` and `server/`.
- Do not commit personal maps in `curmaps/`, API keys, or `.env` files.
