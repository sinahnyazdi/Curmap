import type { Curmap, CurmapNode } from "./schema.js";

function childrenByParent(nodes: CurmapNode[]): Map<string | null, CurmapNode[]> {
  const map = new Map<string | null, CurmapNode[]>();
  for (const node of nodes) {
    const list = map.get(node.parentId) ?? [];
    list.push(node);
    map.set(node.parentId, list);
  }
  return map;
}

function singleLine(text: string): string {
  return text.replace(/\r?\n/g, " ").trim();
}

function formatNotes(notes: string | undefined, baseIndent: string): string[] {
  const trimmed = notes?.trim();
  if (!trimmed) return [];
  return trimmed.split(/\r?\n/).map((line) => `${baseIndent}> ${line}`);
}

/** HTML comment after a bullet; round-trips via import (only explicit node colors, not inherited). */
function formatColor(color: string | undefined, baseIndent: string): string[] {
  if (!color) return [];
  return [`${baseIndent}<!-- color: ${color} -->`];
}

function formatSubtree(
  node: CurmapNode,
  depth: number,
  byParent: Map<string | null, CurmapNode[]>,
): string[] {
  const indent = "  ".repeat(depth);
  const childIndent = `${indent}  `;
  const lines: string[] = [`${indent}- ${singleLine(node.label)}`];
  lines.push(...formatColor(node.color, childIndent));
  lines.push(...formatNotes(node.notes, childIndent));
  for (const child of byParent.get(node.id) ?? []) {
    lines.push(...formatSubtree(child, depth + 1, byParent));
  }
  return lines;
}

/** Render a curmap as readable Markdown (nested bullets + blockquote notes). */
export function curmapToMarkdown(curmap: Curmap): string {
  const byParent = childrenByParent(curmap.nodes);
  const root = curmap.nodes.find((n) => n.parentId === null);
  if (!root) {
    throw new Error("Map has no root node");
  }

  const lines: string[] = [`# ${singleLine(curmap.title)}`, ""];

  if (curmap.description?.trim()) {
    lines.push(curmap.description.trim(), "");
  }

  const rootMeta = [...formatColor(root.color, ""), ...formatNotes(root.notes, "")];
  if (rootMeta.length) {
    lines.push(...rootMeta, "");
  }

  for (const child of byParent.get(root.id) ?? []) {
    lines.push(...formatSubtree(child, 0, byParent));
  }

  lines.push("", "---", "", `*${curmap.id} · updated ${curmap.updatedAt}*`, "");
  return lines.join("\n");
}

export function curmapExportFilename(id: string): string {
  return `${id}.md`;
}
