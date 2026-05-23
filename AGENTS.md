# Agent guide: Curmap workspace

This project stores each mind map as a JSON file in `curmaps/`. Agents can create and update maps without using the web UI.

## Data format

Each file: `curmaps/<id>.json`

```json
{
  "id": "project-plan",
  "title": "Project Plan",
  "description": "Optional",
  "createdAt": "2026-05-22T12:00:00.000Z",
  "updatedAt": "2026-05-22T12:00:00.000Z",
  "nodes": [
    { "id": "root", "label": "Project Plan", "parentId": null },
    { "id": "phase-1", "label": "Phase 1", "parentId": "root", "notes": "Optional notes" },
    { "id": "phase-2", "label": "Phase 2", "parentId": "root", "collapsed": true },
    { "id": "auth", "label": "Authentication", "parentId": "phase-1", "color": "company" }
  ]
}
```

Rules (enforced by `shared/schema.ts`):

- `id` must match the filename (lowercase, hyphens allowed).
- Exactly one node has `parentId: null` (the root); its `id` is usually `root`.
- Every other node's `parentId` must reference an existing node id.
- No cycles; deleting a node should remove its descendants.
- Optional `collapsed: true` on a node hides its descendants in the UI (data remains in JSON).
- Optional `color`: palette key (`personal`, `company`, `skip`, `department`, `deferred`, `inheritance`) or hex `#rrggbb`. Descendants inherit the nearest ancestor color unless they set their own.
- Update `updatedAt` to an ISO timestamp on every change.

## Preferred workflows

### CLI (no server required)

```bash
pnpm run curmap -- list
pnpm run curmap -- create "My Map"
pnpm run curmap -- add-node my-map root child-1 "First branch"
pnpm run curmap -- update-node my-map child-1 "Renamed branch"
pnpm run curmap -- show my-map
pnpm run curmap -- export my-map
pnpm run curmap -- export my-map --out my-map.md
pnpm run curmap -- import my-map.md
pnpm run curmap -- import my-map.md --force
pnpm run curmap -- duplicate my-map
pnpm run curmap -- duplicate my-map --title "My Map backup"
```

Exported Markdown (nested bullets, blockquote notes, footer with map id) round-trips via `import`. Paths are relative to the **project root**. Re-importing an existing map preserves node ids when label paths match.

### Direct file edit

1. Read `curmaps/<id>.json`.
2. Modify `nodes` array (add/change/remove entries).
3. Set `updatedAt` to now.
4. Keep the tree valid (single root, valid parent refs).

### API (when dev server is running)

- `GET /api/curmaps` — list
- `GET /api/curmaps/:id` — load
- `PUT /api/curmaps/:id` — save full document
- `POST /api/curmaps` — create `{ "title" }` (id is derived from the title)
- `POST /api/curmaps/:id/duplicate` — copy all nodes; optional `{ "title" }` (defaults to `Copy of …`, with ` (2)` etc. if needed)
- `DELETE /api/curmaps/:id` — remove

## Creating a new curmap

1. Choose a unique **title**; the `id` is auto-generated (lowercase slug, e.g. `"Sprint 42"` → `sprint-42`) via `curmapIdFromTitle` in `shared/schema.ts`.
2. Either run `pnpm run curmap -- create "Sprint 42"` or write `curmaps/sprint-42.json` using `createEmptyCurmap` shape from `shared/schema.ts` (filename must match `id`).
3. Add nodes with unique ids; connect via `parentId`.

## Multiple maps

- One JSON file per curmap; no shared state between files.
- List all: `pnpm run curmap -- list` or read directory `curmaps/`.
- Do not overwrite unrelated files when updating one map.

## Dev server

```bash
npm install
npm run dev
```

Opens UI at http://localhost:5173 with API on port 3847.
