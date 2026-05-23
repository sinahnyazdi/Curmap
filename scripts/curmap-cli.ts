#!/usr/bin/env tsx
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { curmapToMarkdown } from "../shared/export.js";
import { importCurmapFromMarkdown, curmapIdFromMarkdownFilename } from "../shared/import.js";
import {
  createEmptyCurmap,
  duplicateCurmap,
  curmapIdFromTitle,
  normalizeCurmapTitle,
  touchCurmap,
  validateCurmap,
  type Curmap,
  type CurmapNode,
} from "../shared/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CURMAPS_DIR = path.join(PROJECT_ROOT, "curmaps");

function usage() {
  console.log(`Usage:
  pnpm run curmap -- list
  pnpm run curmap -- create <title> [--description "..."]
  pnpm run curmap -- show <id>
  pnpm run curmap -- export <id> [--out path.md]
  pnpm run curmap -- import <path.md> [--id curmap-id] [--force]
  pnpm run curmap -- add-node <id> <parentId> <nodeId> <label>
  pnpm run curmap -- update-node <id> <nodeId> <label>
  pnpm run curmap -- delete-node <id> <nodeId>
  pnpm run curmap -- duplicate <id> [--title "..."]
  pnpm run curmap -- delete <id>

Examples:
  pnpm run curmap -- create "Product Roadmap"
  pnpm run curmap -- add-node product-roadmap root feature-auth "Authentication"
  pnpm run curmap -- export product-roadmap --out product-roadmap.md
  pnpm run curmap -- import product-roadmap.md
`);
}

function curmapFilePath(id: string) {
  return path.join(CURMAPS_DIR, `${id}.json`);
}

async function readCurmap(id: string): Promise<Curmap> {
  const raw = await fs.readFile(curmapFilePath(id), "utf-8");
  return validateCurmap(JSON.parse(raw));
}

async function writeCurmap(curmap: Curmap) {
  await fs.mkdir(CURMAPS_DIR, { recursive: true });
  const valid = validateCurmap(curmap);
  await fs.writeFile(curmapFilePath(valid.id), JSON.stringify(valid, null, 2) + "\n", "utf-8");
}

async function list() {
  await fs.mkdir(CURMAPS_DIR, { recursive: true });
  const files = (await fs.readdir(CURMAPS_DIR)).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.log('No maps yet. Create one with: pnpm run curmap -- create "My Map"');
    return;
  }
  for (const file of files.sort()) {
    const m = await readCurmap(file.replace(/\.json$/, ""));
    console.log(`${m.id}\t${m.title}\t(updated ${m.updatedAt})`);
  }
}

async function create(title: string, description?: string) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    console.error("Title is required");
    process.exit(1);
  }

  const id = curmapIdFromTitle(trimmedTitle);
  if (!id) {
    console.error("Title must contain at least one letter or number");
    process.exit(1);
  }

  try {
    await readCurmap(id);
    console.error(`A curmap with this name already exists (${id})`);
    process.exit(1);
  } catch {
    // expected
  }

  const normalizedTitle = normalizeCurmapTitle(trimmedTitle);
  await fs.mkdir(CURMAPS_DIR, { recursive: true });
  const files = (await fs.readdir(CURMAPS_DIR)).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const other = await readCurmap(file.replace(/\.json$/, ""));
    if (normalizeCurmapTitle(other.title) === normalizedTitle) {
      console.error("A curmap with this name already exists");
      process.exit(1);
    }
  }

  const curmap = createEmptyCurmap(id, trimmedTitle);
  if (description) curmap.description = description;
  await writeCurmap(curmap);
  console.log(`Created map: ${id}`);
  console.log(curmapFilePath(id));
}

async function show(id: string) {
  const m = await readCurmap(id);
  console.log(JSON.stringify(m, null, 2));
}

async function exportCurmap(id: string, outPath?: string) {
  const m = await readCurmap(id);
  const markdown = curmapToMarkdown(m);
  if (outPath) {
    const target = path.isAbsolute(outPath) ? outPath : path.join(PROJECT_ROOT, outPath);
    await fs.writeFile(target, markdown, "utf-8");
    console.log(`Wrote ${target}`);
  } else {
    process.stdout.write(markdown);
  }
}

function resolveProjectPath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(PROJECT_ROOT, filePath);
}

async function importCurmap(filePath: string, idOverride?: string, force?: boolean) {
  const absPath = resolveProjectPath(filePath);
  const markdown = await fs.readFile(absPath, "utf-8");
  const idFromName = curmapIdFromMarkdownFilename(absPath);
  const footerId = markdown.match(/\*([^·]+) · updated /)?.[1]?.trim();
  const resolvedId = idOverride ?? footerId ?? idFromName;

  let existing: Curmap | undefined;
  if (resolvedId) {
    try {
      existing = await readCurmap(resolvedId);
    } catch {
      // new curmap
    }
  }

  const curmap = importCurmapFromMarkdown(markdown, {
    id: resolvedId,
    preserveFrom: existing,
  });

  if (existing && !force) {
    console.error(
      `Curmap "${curmap.id}" already exists. Pass --force to replace it from ${absPath}`,
    );
    process.exit(1);
  }

  await writeCurmap(curmap);
  console.log(`Imported map: ${curmap.id}`);
  console.log(curmapFilePath(curmap.id));
}

async function addNode(id: string, parentId: string, nodeId: string, label: string) {
  const m = await readCurmap(id);
  if (m.nodes.some((n) => n.id === nodeId)) {
    console.error(`Node "${nodeId}" already exists`);
    process.exit(1);
  }
  if (!m.nodes.some((n) => n.id === parentId)) {
    console.error(`Parent "${parentId}" not found`);
    process.exit(1);
  }
  const node: CurmapNode = { id: nodeId, label, parentId };
  await writeCurmap(touchCurmap({ ...m, nodes: [...m.nodes, node] }));
  console.log(`Added node "${nodeId}" under "${parentId}"`);
}

async function updateNode(id: string, nodeId: string, label: string) {
  const m = await readCurmap(id);
  const idx = m.nodes.findIndex((n) => n.id === nodeId);
  if (idx === -1) {
    console.error(`Node "${nodeId}" not found`);
    process.exit(1);
  }
  const nodes = [...m.nodes];
  nodes[idx] = { ...nodes[idx], label };
  await writeCurmap(touchCurmap({ ...m, nodes }));
  console.log(`Updated node "${nodeId}"`);
}

async function deleteNode(id: string, nodeId: string) {
  const m = await readCurmap(id);
  if (nodeId === "root") {
    console.error("Cannot delete root node");
    process.exit(1);
  }
  const toRemove = new Set<string>();
  function collect(id: string) {
    toRemove.add(id);
    for (const child of m.nodes.filter((n) => n.parentId === id)) {
      collect(child.id);
    }
  }
  collect(nodeId);
  const nodes = m.nodes.filter((n) => !toRemove.has(n.id));
  await writeCurmap(touchCurmap({ ...m, nodes }));
  console.log(`Deleted node "${nodeId}" and descendants`);
}

async function duplicateCurmapCmd(id: string, title?: string) {
  const source = await readCurmap(id);
  await fs.mkdir(CURMAPS_DIR, { recursive: true });
  const files = (await fs.readdir(CURMAPS_DIR)).filter((f) => f.endsWith(".json"));
  const existing: Curmap[] = [];
  for (const file of files) {
    existing.push(await readCurmap(file.replace(/\.json$/, "")));
  }

  const idTaken = (candidate: string) => existing.some((m) => m.id === candidate);
  const titleTaken = (normalized: string) =>
    existing.some((m) => normalizeCurmapTitle(m.title) === normalized);

  const copy = duplicateCurmap(source, { title, idTaken, titleTaken });
  await writeCurmap(copy);
  console.log(`Duplicated map: ${copy.id}`);
  console.log(curmapFilePath(copy.id));
}

async function deleteCurmap(id: string) {
  await fs.unlink(curmapFilePath(id));
  console.log(`Deleted map: ${id}`);
}

const [,, command, ...args] = process.argv;

try {
  switch (command) {
    case "list":
      await list();
      break;
    case "create": {
      const descIdx = args.indexOf("--description");
      const description = descIdx >= 0 ? args[descIdx + 1] : undefined;
      const title = (descIdx >= 0 ? args.slice(0, descIdx) : args).join(" ").trim();
      if (!title) {
        console.error("create requires a title");
        process.exit(1);
      }
      await create(title, description);
      break;
    }
    case "show":
      await show(args[0]);
      break;
    case "export": {
      const outIdx = args.indexOf("--out");
      const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;
      await exportCurmap(args[0], outPath);
      break;
    }
    case "import": {
      const idIdx = args.indexOf("--id");
      const idOverride = idIdx >= 0 ? args[idIdx + 1] : undefined;
      const filePath = args.find((a) => !a.startsWith("--") && a !== idOverride);
      if (!filePath) {
        console.error("import requires a .md file path");
        process.exit(1);
      }
      await importCurmap(filePath, idOverride, args.includes("--force"));
      break;
    }
    case "add-node":
      await addNode(args[0], args[1], args[2], args.slice(3).join(" "));
      break;
    case "update-node":
      await updateNode(args[0], args[1], args.slice(2).join(" "));
      break;
    case "delete-node":
      await deleteNode(args[0], args[1]);
      break;
    case "duplicate": {
      const titleIdx = args.indexOf("--title");
      const title = titleIdx >= 0 ? args[titleIdx + 1] : undefined;
      const id = (titleIdx >= 0 ? args.slice(0, titleIdx) : args)[0];
      if (!id) {
        console.error("duplicate requires a map id");
        process.exit(1);
      }
      await duplicateCurmapCmd(id, title);
      break;
    }
    case "delete":
      await deleteCurmap(args[0]);
      break;
    default:
      usage();
      process.exit(command ? 1 : 0);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
