import { z } from "zod";
import { isNodeColor } from "./colors.js";

export const CurmapNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  parentId: z.string().nullable(),
  notes: z.string().optional(),
  /** When true, descendants are hidden in the UI until expanded. */
  collapsed: z.boolean().optional(),
  /** Named palette key (e.g. `company`) or hex `#rrggbb`. Inherited by descendants unless overridden. */
  color: z
    .string()
    .refine(isNodeColor, { message: "color must be a palette key or #rrggbb hex" })
    .optional(),
});

export const CurmapSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  nodes: z.array(CurmapNodeSchema).min(1),
});

export type CurmapNode = z.infer<typeof CurmapNodeSchema>;
export type Curmap = z.infer<typeof CurmapSchema>;

export type CurmapSummary = Pick<Curmap, "id" | "title" | "description" | "updatedAt">;

/** Matches curmap `id` and filename slug rules. */
export const CURMAP_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Derive a filesystem-safe curmap id from a display title (lowercase slug). */
export function curmapIdFromTitle(title: string): string | null {
  const slug = title
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug || !CURMAP_ID_PATTERN.test(slug)) return null;
  return slug;
}

export function normalizeCurmapTitle(title: string): string {
  return title.trim().toLowerCase();
}

export function createEmptyCurmap(id: string, title: string): Curmap {
  const now = new Date().toISOString();
  return {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    nodes: [
      {
        id: "root",
        label: title,
        parentId: null,
      },
    ],
  };
}

export function touchCurmap(curmap: Curmap): Curmap {
  return { ...curmap, updatedAt: new Date().toISOString() };
}

export function defaultDuplicateTitle(sourceTitle: string): string {
  return `Copy of ${sourceTitle}`;
}

/** Pick a unique id/title pair from a preferred title (appends " (2)", " (3)", …). */
export function resolveUniqueCurmapIdentity(
  preferredTitle: string,
  options: {
    idTaken: (id: string) => boolean;
    titleTaken?: (normalizedTitle: string) => boolean;
  },
): { id: string; title: string } {
  const base = preferredTitle.trim();
  if (!base) {
    throw new Error("Title is required");
  }

  const titleTaken = options.titleTaken ?? (() => false);

  for (let attempt = 0; attempt < 1000; attempt++) {
    const candidateTitle = attempt === 0 ? base : `${base} (${attempt + 1})`;
    const id = curmapIdFromTitle(candidateTitle);
    if (!id) {
      throw new Error("Title must contain at least one letter or number");
    }
    if (!options.idTaken(id) && !titleTaken(normalizeCurmapTitle(candidateTitle))) {
      return { id, title: candidateTitle };
    }
  }

  throw new Error("Could not find an available name for the duplicate");
}

/** Deep-copy a curmap with a new id, title, and timestamps. */
export function duplicateCurmap(
  source: Curmap,
  options: {
    title?: string;
    idTaken: (id: string) => boolean;
    titleTaken?: (normalizedTitle: string) => boolean;
  },
): Curmap {
  const preferredTitle = options.title?.trim() || defaultDuplicateTitle(source.title);
  const { id, title } = resolveUniqueCurmapIdentity(preferredTitle, options);
  const now = new Date().toISOString();
  const root = source.nodes.find((n) => n.parentId === null);
  const nodes = source.nodes.map((node) => ({
    ...node,
    ...(root && node.id === root.id ? { label: title } : {}),
  }));

  return {
    id,
    title,
    ...(source.description !== undefined ? { description: source.description } : {}),
    createdAt: now,
    updatedAt: now,
    nodes,
  };
}

export function validateCurmap(data: unknown): Curmap {
  const parsed = CurmapSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }

  const rootCount = parsed.data.nodes.filter((n) => n.parentId === null).length;
  if (rootCount !== 1) {
    throw new Error(`Expected exactly one root node, found ${rootCount}`);
  }

  const ids = new Set(parsed.data.nodes.map((n) => n.id));
  for (const node of parsed.data.nodes) {
    if (node.parentId !== null && !ids.has(node.parentId)) {
      throw new Error(`Node "${node.id}" references missing parent "${node.parentId}"`);
    }
    if (node.parentId === node.id) {
      throw new Error(`Node "${node.id}" cannot be its own parent`);
    }
  }

  return parsed.data;
}
