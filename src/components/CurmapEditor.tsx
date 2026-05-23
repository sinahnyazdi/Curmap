import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { curmapExportFilename, curmapToMarkdown } from "@shared/export";
import { flowToCurmap, mergeCurmapNodes, curmapToFlow } from "@shared/layout";
import type { Curmap, CurmapNode as CurmapNodeRecord } from "@shared/schema";
import { getCurmap, saveCurmap } from "../api";
import { downloadTextFile } from "../download";
import { useTheme } from "../ThemeProvider";
import { CurmapActionsProvider } from "./CurmapActionsContext";
import { CurmapNode } from "./CurmapNode";
import { ChatSidebar } from "./ChatSidebar";
import { NodeSidebar } from "./NodeSidebar";
import { AddChildIcon, ArrowLeftIcon, ExportIcon, RedoIcon, UndoIcon } from "./icons";
import { IconButton } from "./IconButton";
import { SettingsButton } from "./SettingsButton";
import {
  isEditableKeyboardTarget,
  useCurmapEditorHistory,
  type EditorSnapshot,
} from "../hooks/useCurmapEditorHistory";

const nodeTypes: NodeTypes = { curmap: CurmapNode };

const AUTO_SAVE_DEBOUNCE_MS = 600;

const defaultEdgeOptions = {
  type: "smoothstep" as const,
  style: { strokeWidth: 1.5, stroke: "var(--edge)" },
  pathOptions: { borderRadius: 28, offset: 32 },
};

function collectSubtreeIds(nodeId: string, nodes: CurmapNodeRecord[]): Set<string> {
  const ids = new Set<string>();
  const collect = (id: string) => {
    ids.add(id);
    nodes.filter((n) => n.parentId === id).forEach((n) => collect(n.id));
  };
  collect(nodeId);
  return ids;
}

type Props = {
  curmap: Curmap;
  onReload: (curmap: Curmap) => void;
  onBack: () => void;
};

function curmapMeta(m: Curmap): Pick<Curmap, "id" | "title" | "description" | "createdAt" | "updatedAt"> {
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

export function CurmapEditor({ curmap, onReload, onBack }: Props) {
  const { preference } = useTheme();
  const [documentNodes, setDocumentNodes] = useState<CurmapNodeRecord[]>(curmap.nodes);
  const initial = useMemo(
    () => curmapToFlow({ ...curmap, nodes: documentNodes }),
    [curmap.id],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editRevision, setEditRevision] = useState(0);
  const dirtyRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const savedStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragHistoryCommittedRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const silentSaveRef = useRef(false);
  const loadedCurmapIdRef = useRef(curmap.id);
  const lastSyncedUpdatedAtRef = useRef<string | null>(null);
  const curmapMetaRef = useRef(curmapMeta(curmap));
  const editorRef = useRef<HTMLDivElement>(null);

  const captureSnapshot = useCallback(
    (): EditorSnapshot => ({
      documentNodes,
      nodes,
      edges,
      selectedId,
    }),
    [documentNodes, nodes, edges, selectedId],
  );

  const {
    canUndo,
    canRedo,
    commitBeforeMutation,
    undo: undoHistory,
    redo: redoHistory,
    reset: resetHistory,
  } = useCurmapEditorHistory(captureSnapshot);

  const restoreSnapshot = useCallback(
    (snapshot: EditorSnapshot) => {
      setDocumentNodes(snapshot.documentNodes);
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      setSelectedId(snapshot.selectedId);
      const sel = snapshot.nodes.find((n) => n.id === snapshot.selectedId);
      if (sel) {
        setLabel(String(sel.data.label ?? ""));
        setNotes(String(sel.data.notes ?? ""));
      } else {
        setLabel("");
        setNotes("");
      }
    },
    [setNodes, setEdges],
  );

  const applyDocumentToFlow = useCallback(
    (docNodes: CurmapNodeRecord[]) => {
      const { nodes: n, edges: e } = curmapToFlow({
        ...curmapMetaRef.current,
        nodes: docNodes,
      } as Curmap);
      setNodes(n);
      setEdges(e);
    },
    [setNodes, setEdges],
  );

  const syncFromServerCurmap = useCallback(
    (source: Curmap, options?: { resetHistory?: boolean }) => {
      curmapMetaRef.current = curmapMeta(source);
      setDocumentNodes(source.nodes);
      applyDocumentToFlow(source.nodes);
      dirtyRef.current = false;
      setDirty(false);
      dragHistoryCommittedRef.current = false;
      lastSyncedUpdatedAtRef.current = source.updatedAt;
      if (options?.resetHistory !== false) {
        resetHistory();
      }
    },
    [applyDocumentToFlow, resetHistory],
  );

  const applyAgentCurmap = useCallback(
    (source: Curmap) => {
      commitBeforeMutation();
      syncFromServerCurmap(source, { resetHistory: false });
    },
    [commitBeforeMutation, syncFromServerCurmap],
  );

  useEffect(() => {
    const idChanged = loadedCurmapIdRef.current !== curmap.id;
    const externalUpdate = lastSyncedUpdatedAtRef.current !== curmap.updatedAt;
    if (!idChanged && !externalUpdate) return;

    loadedCurmapIdRef.current = curmap.id;
    syncFromServerCurmap(curmap);
  }, [curmap, syncFromServerCurmap]);

  const selected = nodes.find((n) => n.id === selectedId);

  useEffect(() => {
    if (selected) {
      setLabel(String(selected.data.label ?? ""));
      setNotes(String(selected.data.notes ?? ""));
    }
  }, [selected]);

  const markDirty = useCallback((options?: { silent?: boolean }) => {
    dirtyRef.current = true;
    setDirty(true);
    setEditRevision((r) => r + 1);
    if (options?.silent) {
      silentSaveRef.current = true;
      if (savedStatusTimerRef.current) {
        clearTimeout(savedStatusTimerRef.current);
        savedStatusTimerRef.current = null;
      }
      setStatus(null);
    } else {
      silentSaveRef.current = false;
    }
  }, []);

  const handleUndo = useCallback(() => {
    if (undoHistory(restoreSnapshot)) markDirty({ silent: true });
  }, [undoHistory, restoreSnapshot, markDirty]);

  const handleRedo = useCallback(() => {
    if (redoHistory(restoreSnapshot)) markDirty({ silent: true });
  }, [redoHistory, restoreSnapshot, markDirty]);

  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isEditableKeyboardTarget(e.target)) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.code === "KeyZ" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (e.code === "KeyZ" && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      } else if (e.code === "KeyY") {
        e.preventDefault();
        handleRedo();
      }
    },
    [handleUndo, handleRedo],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      commitBeforeMutation();
      setEdges((eds) => addEdge({ ...connection, ...defaultEdgeOptions }, eds));
      markDirty();
    },
    [setEdges, markDirty, commitBeforeMutation],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedId(node.id);
  }, []);

  const applyNodeEdits = useCallback(() => {
    if (!selectedId) return;
    commitBeforeMutation();
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedId ? { ...n, data: { ...n.data, label, notes } } : n,
      ),
    );
    markDirty();
  }, [selectedId, label, notes, setNodes, markDirty, commitBeforeMutation]);

  const toggleCollapse = useCallback(
    (nodeId: string) => {
      commitBeforeMutation();
      setDocumentNodes((docNodes) => {
        const updated = docNodes.map((n) => {
          if (n.id !== nodeId) return n;
          if (n.collapsed) {
            const { collapsed: _c, ...rest } = n;
            return rest;
          }
          return { ...n, collapsed: true };
        });
        applyDocumentToFlow(updated);
        return updated;
      });
      markDirty();
    },
    [applyDocumentToFlow, markDirty, commitBeforeMutation],
  );

  const addChild = useCallback(() => {
    commitBeforeMutation();
    const parentId = selectedId ?? "root";
    const id = `node-${Date.now()}`;
    const newNode: CurmapNodeRecord = { id, label: "New node", parentId };
    setDocumentNodes((docNodes) => {
      const updated = [...docNodes, newNode];
      applyDocumentToFlow(updated);
      return updated;
    });
    setSelectedId(id);
    setLabel("New node");
    setNotes("");
    markDirty();
  }, [selectedId, applyDocumentToFlow, markDirty, commitBeforeMutation]);

  const rootId = useMemo(
    () => documentNodes.find((n) => n.parentId === null)?.id ?? "root",
    [documentNodes],
  );

  const removeNodesFromDocument = useCallback(
    (ids: Set<string>) => {
      if (!ids.size) return;
      commitBeforeMutation();
      setDocumentNodes((docNodes) => {
        const updated = docNodes.filter((n) => !ids.has(n.id));
        applyDocumentToFlow(updated);
        return updated;
      });
      setSelectedId((current) => (current && ids.has(current) ? null : current));
      markDirty();
    },
    [applyDocumentToFlow, markDirty, commitBeforeMutation],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      const ids = new Set<string>();
      for (const node of deleted) {
        if (node.id === rootId) continue;
        for (const id of collectSubtreeIds(node.id, documentNodes)) {
          ids.add(id);
        }
      }
      removeNodesFromDocument(ids);
    },
    [documentNodes, rootId, removeNodesFromDocument],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      commitBeforeMutation();
      setDocumentNodes((docNodes) => {
        let updated = docNodes;
        const toRemove = new Set<string>();

        for (const edge of deleted) {
          const { target, source } = edge;
          if (target === rootId) continue;

          if (source === rootId) {
            for (const id of collectSubtreeIds(target, updated)) {
              toRemove.add(id);
            }
          } else {
            updated = updated.map((n) =>
              n.id === target ? { ...n, parentId: rootId } : n,
            );
          }
        }

        if (toRemove.size) {
          updated = updated.filter((n) => !toRemove.has(n.id));
        }
        applyDocumentToFlow(updated);
        return updated;
      });
      markDirty();
    },
    [rootId, applyDocumentToFlow, markDirty, commitBeforeMutation],
  );

  const buildCurrentCurmap = useCallback((): Curmap => {
    const meta = curmapMetaRef.current;
    const fromFlow = flowToCurmap({ ...meta, nodes: documentNodes } as Curmap, nodes, edges);
    const nodeData = mergeCurmapNodes(documentNodes, fromFlow);
    return {
      ...meta,
      nodes: nodeData,
      title: nodeData.find((n) => n.parentId === null)?.label ?? meta.title,
    };
  }, [nodes, edges, documentNodes]);

  const buildCurrentCurmapRef = useRef(buildCurrentCurmap);
  buildCurrentCurmapRef.current = buildCurrentCurmap;

  const clearSavedStatusTimer = useCallback(() => {
    if (savedStatusTimerRef.current) {
      clearTimeout(savedStatusTimerRef.current);
      savedStatusTimerRef.current = null;
    }
  }, []);

  const flushSaveRef = useRef<() => Promise<void>>(async () => {});

  const flushSave = useCallback(async () => {
    if (!dirtyRef.current) return;

    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return;
    }

    const silent = silentSaveRef.current;
    silentSaveRef.current = false;

    saveInFlightRef.current = true;
    clearSavedStatusTimer();
    if (silent) {
      setStatus(null);
    }

    try {
      while (dirtyRef.current) {
        const payload = buildCurrentCurmapRef.current();
        const saved = await saveCurmap(payload);
        curmapMetaRef.current = curmapMeta(saved);
        if (!dirtyRef.current) break;
      }
      dirtyRef.current = false;
      setDirty(false);
      if (!silent) {
        setStatus("Saved");
        savedStatusTimerRef.current = setTimeout(() => {
          setStatus(null);
          savedStatusTimerRef.current = null;
        }, 2000);
      }
    } catch (err) {
      dirtyRef.current = true;
      setDirty(true);
      setEditRevision((r) => r + 1);
      setStatus(err instanceof Error ? err.message : "Save failed");
    } finally {
      saveInFlightRef.current = false;
      if (saveQueuedRef.current) {
        saveQueuedRef.current = false;
        void flushSaveRef.current();
      }
    }
  }, [clearSavedStatusTimer]);

  flushSaveRef.current = flushSave;

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      void flushSaveRef.current();
    }, AUTO_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [dirty, editRevision]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || saveInFlightRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => () => clearSavedStatusTimer(), [clearSavedStatusTimer]);

  const handleExport = useCallback(() => {
    const current = buildCurrentCurmap();
    downloadTextFile(
      curmapExportFilename(current.id),
      curmapToMarkdown(current),
    );
  }, [buildCurrentCurmap]);

  const reloadFromServer = useCallback(async () => {
    if (dirtyRef.current) {
      await flushSaveRef.current();
    }
    if (dirtyRef.current) return;
    try {
      const fresh = await getCurmap(curmap.id);
      applyAgentCurmap(fresh);
      onReload(fresh);
    } catch {
      /* keep current view if reload fails */
    }
  }, [curmap.id, onReload, applyAgentCurmap]);

  const displayTitle =
    documentNodes.find((n) => n.parentId === null)?.label ?? curmapMetaRef.current.title;

  return (
    <div
      ref={editorRef}
      className="editor"
      tabIndex={-1}
      onKeyDownCapture={handleEditorKeyDown}
      onMouseDown={(e) => {
        if (!isEditableKeyboardTarget(e.target)) {
          editorRef.current?.focus({ preventScroll: true });
        }
      }}
    >
      <header className="editor-header">
        <div className="editor-nav">
          <IconButton tooltip="Back to maps" onClick={onBack}>
            <ArrowLeftIcon />
          </IconButton>
        </div>
        <h1>{displayTitle}</h1>
        <div className="editor-actions">
          {status ? <span className="status">{status}</span> : null}
          <IconButton tooltip="Undo (⌘Z)" onClick={handleUndo} disabled={!canUndo}>
            <UndoIcon />
          </IconButton>
          <IconButton tooltip="Redo (⌘⇧Z)" onClick={handleRedo} disabled={!canRedo}>
            <RedoIcon />
          </IconButton>
          <IconButton tooltip="Add child node" onClick={addChild}>
            <AddChildIcon />
          </IconButton>
          <IconButton tooltip="Export Markdown" onClick={handleExport}>
            <ExportIcon />
          </IconButton>
          <SettingsButton />
        </div>
      </header>

      <div className="editor-body">
        <NodeSidebar
          selectedId={selected?.id ?? null}
          label={label}
          notes={notes}
          onLabelChange={setLabel}
          onNotesChange={setNotes}
          onApply={applyNodeEdits}
        />

        <div className="canvas">
          <CurmapActionsProvider onToggleCollapse={toggleCollapse}>
            <ReactFlow
              colorMode={preference}
              nodes={nodes}
              edges={edges}
              onNodesChange={(changes) => {
                const dragStart = changes.some(
                  (c) => c.type === "position" && "dragging" in c && c.dragging === true,
                );
                const dragEnd = changes.some(
                  (c) => c.type === "position" && "dragging" in c && c.dragging === false,
                );
                if (dragStart && !dragHistoryCommittedRef.current) {
                  commitBeforeMutation();
                  dragHistoryCommittedRef.current = true;
                }
                onNodesChange(changes);
                if (dragEnd) {
                  dragHistoryCommittedRef.current = false;
                  markDirty();
                }
              }}
              onEdgesChange={(changes) => {
                const removed = changes.some((c) => c.type === "remove");
                if (removed) commitBeforeMutation();
                onEdgesChange(changes);
                if (removed) markDirty();
              }}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onSelectionChange={({ nodes: selectedNodes }) => {
                if (selectedNodes.length === 1) {
                  setSelectedId(selectedNodes[0].id);
                }
              }}
              onNodesDelete={onNodesDelete}
              onEdgesDelete={onEdgesDelete}
              onBeforeDelete={async ({ nodes: nodesToDelete }) =>
                !nodesToDelete.some((n) => n.id === rootId)
              }
              nodeTypes={nodeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              fitView
              fitViewOptions={{ padding: 0.35, maxZoom: 0.85 }}
              minZoom={0.15}
              deleteKeyCode={["Delete", "Backspace"]}
            >
              <Background gap={28} size={1.5} />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </CurmapActionsProvider>
        </div>

        <ChatSidebar
          curmapId={curmap.id}
          curmapTitle={curmap.title}
          onCurmapUpdated={reloadFromServer}
        />
      </div>
    </div>
  );
}
