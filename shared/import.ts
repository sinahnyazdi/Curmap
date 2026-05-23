import { isNodeColor } from "./colors.js";
import type { Curmap, CurmapNode } from "./schema.js";
import { touchCurmap, validateCurmap } from "./schema.js";

const COLOR_COMMENT_RE = /^\s*<!--\s*color:\s*(.+?)\s*-->$/;

const FOOTER_RE = /^\*([^·]+) · updated (.+)\*$/;
const TITLE_RE = /^# (.+)$/;

export type MarkdownImportOptions = {
  /** Override curmap id (otherwise parsed from footer or derived from filename). */
  id?: string;
  /** When set, reuse node ids from this curmap when label paths match. */
  preserveFrom?: Curmap;
};

type FlatNode = {
  depth: number;
  label: string;
  notes: string[];
  color?: string;
};

function parseColorComment(line: string): string | undefined {
  const match = line.match(COLOR_COMMENT_RE);
  if (!match) return undefined;
  const color = match[1].trim();
  if (!isNodeColor(color)) {
    throw new Error(`Invalid node color in markdown: ${color}`);
  }
  return color;
}

function slugify(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return base || "node";
}

function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  const id = `${base}-${n}`;
  used.add(id);
  return id;
}

function parseFooter(lines: string[]): { id?: string; updatedAt?: string; bodyEnd: number } {
  let i = lines.length - 1;
  while (i >= 0 && lines[i].trim() === "") i--;
  if (i < 0) return { bodyEnd: lines.length };

  const footerMatch = lines[i].match(FOOTER_RE);
  if (!footerMatch) return { bodyEnd: lines.length };

  i--;
  while (i >= 0 && lines[i].trim() === "") i--;
  if (i >= 0 && lines[i].trim() === "---") i--;

  while (i >= 0 && lines[i].trim() === "") i--;

  return {
    id: footerMatch[1].trim(),
    updatedAt: footerMatch[2].trim(),
    bodyEnd: i + 1,
  };
}

function parseFlatTree(lines: string[]): FlatNode[] {
  const items: FlatNode[] = [];

  for (const line of lines) {
    const bullet = line.match(/^(\s*)- (.+)$/);
    if (bullet) {
      const depth = bullet[1].length / 2;
      items.push({ depth, label: bullet[2].trim(), notes: [] });
      continue;
    }

    const color = parseColorComment(line);
    if (color !== undefined && items.length > 0) {
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      const last = items[items.length - 1];
      const expectedIndent = last.depth * 2 + 2;
      if (indent === expectedIndent) {
        last.color = color;
        continue;
      }
    }

    const quote = line.match(/^(\s*)> (.+)$/);
    if (quote && items.length > 0) {
      const noteIndent = quote[1].length;
      const last = items[items.length - 1];
      const expectedNoteIndent = last.depth * 2 + 2;
      if (noteIndent === expectedNoteIndent || (last.depth === 0 && noteIndent === 0)) {
        last.notes.push(quote[2]);
      }
      continue;
    }

    if (line.trim() !== "") {
      throw new Error(`Unexpected line in curmap tree: ${line}`);
    }
  }

  return items;
}

function flatToNodes(items: FlatNode[], preserveFrom?: Curmap): CurmapNode[] {
  const nodes: CurmapNode[] = [
    {
      id: "root",
      label: "",
      parentId: null,
    },
  ];
  const usedIds = new Set<string>(["root"]);
  const parentStack: { depth: number; id: string }[] = [{ depth: -1, id: "root" }];

  const pathKey = (labels: string[]) => labels.join("\0");
  const preservedByPath = new Map<string, string>();
  const preservedById = preserveFrom
    ? new Map(preserveFrom.nodes.map((n) => [n.id, n]))
    : undefined;

  if (preserveFrom) {
    const byId = preservedById!;
    for (const node of preserveFrom.nodes) {
      if (node.parentId === null) continue;
      const labels: string[] = [node.label];
      let pid: string | null = node.parentId;
      while (pid) {
        const parent = byId.get(pid);
        if (!parent || parent.parentId === null) break;
        labels.unshift(parent.label);
        pid = parent.parentId;
      }
      preservedByPath.set(pathKey(labels), node.id);
    }
  }

  const labelPath: string[] = [];

  for (const item of items) {
    while (parentStack.length > 0 && parentStack[parentStack.length - 1].depth >= item.depth) {
      parentStack.pop();
      labelPath.pop();
    }

    const parentId = parentStack[parentStack.length - 1].id;
    labelPath.push(item.label);

    const preservedId = preservedByPath.get(pathKey(labelPath));
    const id =
      preservedId && !usedIds.has(preservedId)
        ? preservedId
        : uniqueId(slugify(item.label), usedIds);
    usedIds.add(id);

    const node: CurmapNode = {
      id,
      label: item.label,
      parentId,
    };
    if (item.notes.length) {
      node.notes = item.notes.join("\n");
    }
    if (item.color) {
      node.color = item.color;
    } else if (preservedId) {
      const preserved = preservedById?.get(preservedId);
      if (preserved?.color) node.color = preserved.color;
    }
    nodes.push(node);
    parentStack.push({ depth: item.depth, id });
  }

  return nodes;
}

/** Parse exported Markdown back into a curmap document. */
export function markdownToCurmap(
  markdown: string,
  options: MarkdownImportOptions = {},
): Curmap {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const { id: footerId, bodyEnd } = parseFooter(lines);
  const body = lines.slice(0, bodyEnd);

  let i = 0;
  while (i < body.length && body[i].trim() === "") i++;

  const titleMatch = body[i]?.match(TITLE_RE);
  if (!titleMatch) {
    throw new Error("Markdown must start with a # title heading");
  }
  const title = titleMatch[1].trim();
  i++;

  while (i < body.length && body[i].trim() === "") i++;

  const descriptionLines: string[] = [];
  const rootNoteLines: string[] = [];
  let rootColor: string | undefined;
  const treeStart = { index: body.length };

  while (i < body.length) {
    const line = body[i];
    if (/^(\s*)- /.test(line)) {
      treeStart.index = i;
      break;
    }
    const rootColorParsed = parseColorComment(line);
    if (rootColorParsed !== undefined) {
      rootColor = rootColorParsed;
      i++;
      continue;
    }
    if (/^> /.test(line)) {
      rootNoteLines.push(line.slice(2));
      i++;
      continue;
    }
    if (line.trim() === "") {
      if (descriptionLines.length > 0 && i + 1 < body.length && !/^(\s*)- /.test(body[i + 1]) && !/^> /.test(body[i + 1])) {
        descriptionLines.push("");
      }
      i++;
      continue;
    }
    descriptionLines.push(line);
    i++;
  }

  const treeLines = body.slice(treeStart.index);
  const flat = parseFlatTree(treeLines);
  const id = options.id ?? footerId;
  if (!id) {
    throw new Error("Map id required: include export footer or pass --id");
  }

  const now = new Date().toISOString();
  const preserveFrom =
    options.preserveFrom?.id === id ? options.preserveFrom : undefined;

  const nodes = flatToNodes(flat, preserveFrom);
  const root = nodes[0];
  root.label = title;
  if (rootNoteLines.length) {
    root.notes = rootNoteLines.join("\n");
  }
  if (rootColor) {
    root.color = rootColor;
  } else {
    const preservedRoot = preserveFrom?.nodes.find((n) => n.parentId === null);
    if (preservedRoot?.color) root.color = preservedRoot.color;
  }

  const description = descriptionLines.join("\n").trim();

  const curmap: Curmap = {
    id,
    title,
    createdAt: preserveFrom?.createdAt ?? now,
    updatedAt: now,
    nodes,
    ...(description ? { description } : {}),
  };

  return validateCurmap(curmap);
}

/** Import markdown and bump updatedAt to now. */
export function importCurmapFromMarkdown(
  markdown: string,
  options: MarkdownImportOptions = {},
): Curmap {
  return touchCurmap(markdownToCurmap(markdown, options));
}

export function curmapIdFromMarkdownFilename(filename: string): string | undefined {
  const base = pathBasename(filename).replace(/\.md$/i, "");
  if (/^[a-z0-9][a-z0-9-]*$/.test(base)) return base;
  return undefined;
}

function pathBasename(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? filePath;
}
