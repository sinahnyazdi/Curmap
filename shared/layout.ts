import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";
import { resolveNodeColor } from "./colors.js";
import type { Curmap, CurmapNode } from "./schema.js";

const BASE_NODE_WIDTH = 200;
const BASE_NODE_HEIGHT = 56;
const MIN_NODE_WIDTH_PADDING = 24;

function buildChildrenMap(nodes: CurmapNode[]): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (node.parentId) {
      const list = children.get(node.parentId) ?? [];
      list.push(node.id);
      children.set(node.parentId, list);
    }
  }
  return children;
}

function collectDescendants(
  nodeId: string,
  children: Map<string, string[]>,
): Set<string> {
  const hidden = new Set<string>();
  const stack = [...(children.get(nodeId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    hidden.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return hidden;
}

/** Node ids hidden because an ancestor has `collapsed: true`. */
export function getHiddenNodeIds(nodes: CurmapNode[]): Set<string> {
  const children = buildChildrenMap(nodes);
  const hidden = new Set<string>();
  for (const node of nodes) {
    if (node.collapsed) {
      for (const id of collectDescendants(node.id, children)) {
        hidden.add(id);
      }
    }
  }
  return hidden;
}

export function getVisibleNodes(nodes: CurmapNode[]): CurmapNode[] {
  const hidden = getHiddenNodeIds(nodes);
  return nodes.filter((n) => !hidden.has(n.id));
}

function estimateNodeSize(node: CurmapNode): { width: number; height: number } {
  const labelLines = Math.max(1, Math.ceil(node.label.length / 26));
  const notes = node.notes?.trim() ?? "";
  const notesLines = notes ? Math.max(1, Math.ceil(notes.length / 30)) : 0;

  const width = Math.min(280, Math.max(BASE_NODE_WIDTH, labelLines * 140));
  const height =
    BASE_NODE_HEIGHT +
    (labelLines - 1) * 22 +
    notesLines * 18 +
    (notes ? 14 : 0) +
    MIN_NODE_WIDTH_PADDING;

  return { width, height };
}

export function curmapToFlow(curmap: Curmap): { nodes: Node[]; edges: Edge[] } {
  const children = buildChildrenMap(curmap.nodes);
  const visible = getVisibleNodes(curmap.nodes);

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    nodesep: 120,
    ranksep: 220,
    edgesep: 40,
    marginx: 96,
    marginy: 96,
  });

  const sizes = new Map<string, { width: number; height: number }>();
  for (const node of visible) {
    const size = estimateNodeSize(node);
    sizes.set(node.id, size);
    graph.setNode(node.id, size);
  }

  const edges: Edge[] = [];
  for (const node of visible) {
    if (node.parentId && visible.some((n) => n.id === node.parentId)) {
      graph.setEdge(node.parentId, node.id);
      const stroke = resolveNodeColor(node.id, curmap.nodes);
      edges.push({
        id: `${node.parentId}->${node.id}`,
        source: node.parentId,
        target: node.id,
        type: "smoothstep",
        style: stroke ? { stroke, strokeWidth: 2 } : undefined,
      });
    }
  }

  dagre.layout(graph);

  const nodes: Node[] = visible.map((node) => {
    const pos = graph.node(node.id);
    const { width, height } = sizes.get(node.id)!;
    const childCount = children.get(node.id)?.length ?? 0;
    const accent = resolveNodeColor(node.id, curmap.nodes);
    return {
      id: node.id,
      type: "curmap",
      position: {
        x: pos.x - width / 2,
        y: pos.y - height / 2,
      },
      data: {
        label: node.label,
        notes: node.notes ?? "",
        collapsed: node.collapsed === true,
        hasChildren: childCount > 0,
        ...(accent ? { accent } : {}),
      },
    };
  });

  return { nodes, edges };
}

export function flowToCurmap(
  curmap: Curmap,
  flowNodes: Node[],
  flowEdges: Edge[],
): CurmapNode[] {
  const parentByChild = new Map<string, string | null>();

  for (const node of flowNodes) {
    parentByChild.set(node.id, null);
  }

  for (const edge of flowEdges) {
    parentByChild.set(edge.target, edge.source);
  }

  return flowNodes.map((flowNode) => {
    const existing = curmap.nodes.find((n) => n.id === flowNode.id);
    const label =
      typeof flowNode.data.label === "string" && flowNode.data.label
        ? flowNode.data.label
        : (existing?.label ?? flowNode.id);
    const notes =
      typeof flowNode.data.notes === "string" ? flowNode.data.notes : existing?.notes;
    const collapsed = flowNode.data.collapsed === true;
    const color =
      typeof flowNode.data.color === "string"
        ? flowNode.data.color
        : existing?.color;

    return {
      id: flowNode.id,
      label,
      parentId: parentByChild.get(flowNode.id) ?? null,
      ...(notes ? { notes } : {}),
      ...(collapsed ? { collapsed: true } : {}),
      ...(color ? { color } : {}),
    };
  });
}

/** Merge visible canvas edits into the full document (keeps collapsed-hidden nodes). */
export function mergeCurmapNodes(
  document: CurmapNode[],
  fromFlow: CurmapNode[],
): CurmapNode[] {
  const flowMap = new Map(fromFlow.map((n) => [n.id, n]));
  const docIds = new Set(document.map((n) => n.id));

  const merged = document.map((docNode) => {
    const flowNode = flowMap.get(docNode.id);
    if (!flowNode) return docNode;
    const { collapsed: _c, ...docRest } = docNode;
    const { collapsed: flowCollapsed, ...flowRest } = flowNode;
    return {
      ...docRest,
      ...flowRest,
      ...(flowCollapsed ? { collapsed: true } : {}),
    };
  });

  for (const flowNode of fromFlow) {
    if (!docIds.has(flowNode.id)) merged.push(flowNode);
  }

  return merged;
}
