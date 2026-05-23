import type { CurmapNode } from "./schema.js";

/** Named palette keys stored in curmap JSON; hex (#rrggbb) is also allowed. */
export const NODE_COLOR_KEYS = [
  "personal",
  "company",
  "skip",
  "department",
  "deferred",
  "inheritance",
] as const;

export type NodeColorKey = (typeof NODE_COLOR_KEYS)[number];

const PALETTE: Record<NodeColorKey, string> = {
  personal: "#6366f1",
  company: "#0d9488",
  skip: "#ea580c",
  department: "#7c3aed",
  deferred: "#64748b",
  inheritance: "#ca8a04",
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isNodeColor(value: string): boolean {
  return (NODE_COLOR_KEYS as readonly string[]).includes(value) || HEX_RE.test(value);
}

export function resolveNodeColorValue(color: string): string {
  if (HEX_RE.test(color)) return color;
  if (color in PALETTE) return PALETTE[color as NodeColorKey];
  return color;
}

/** Walk ancestors; first explicit `color` on the path wins. */
export function resolveNodeColor(nodeId: string, nodes: CurmapNode[]): string | undefined {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let current = byId.get(nodeId);
  while (current) {
    if (current.color) return resolveNodeColorValue(current.color);
    if (current.parentId === null) break;
    current = byId.get(current.parentId);
  }
  return undefined;
}
