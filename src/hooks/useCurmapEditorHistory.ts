import type { Edge, Node } from "@xyflow/react";
import { useCallback, useRef, useState } from "react";
import type { CurmapNode } from "@shared/schema";

const MAX_HISTORY = 50;

export type EditorSnapshot = {
  documentNodes: CurmapNode[];
  nodes: Node[];
  edges: Edge[];
  selectedId: string | null;
};

function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return structuredClone(snapshot);
}

function snapshotsEqual(a: EditorSnapshot, b: EditorSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useCurmapEditorHistory(capture: () => EditorSnapshot) {
  const pastRef = useRef<EditorSnapshot[]>([]);
  const futureRef = useRef<EditorSnapshot[]>([]);
  const isRestoringRef = useRef(false);
  const captureRef = useRef(capture);
  captureRef.current = capture;
  const [revision, setRevision] = useState(0);
  const notify = useCallback(() => setRevision((r) => r + 1), []);

  const reset = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    notify();
  }, [notify]);

  const commitBeforeMutation = useCallback(() => {
    if (isRestoringRef.current) return;
    const current = cloneSnapshot(captureRef.current());
    const past = pastRef.current;
    const last = past[past.length - 1];
    if (last && snapshotsEqual(last, current)) return;
    const next = [...past, current];
    if (next.length > MAX_HISTORY) next.shift();
    pastRef.current = next;
    futureRef.current = [];
    notify();
  }, [notify]);

  const undo = useCallback(
    (restore: (snapshot: EditorSnapshot) => void): boolean => {
      const past = pastRef.current;
      if (past.length === 0) return false;
      const previous = past[past.length - 1];
      const current = cloneSnapshot(captureRef.current());
      isRestoringRef.current = true;
      restore(cloneSnapshot(previous));
      isRestoringRef.current = false;
      pastRef.current = past.slice(0, -1);
      futureRef.current = [current, ...futureRef.current];
      notify();
      return true;
    },
    [notify],
  );

  const redo = useCallback(
    (restore: (snapshot: EditorSnapshot) => void): boolean => {
      const future = futureRef.current;
      if (future.length === 0) return false;
      const next = future[0];
      const current = cloneSnapshot(captureRef.current());
      isRestoringRef.current = true;
      restore(cloneSnapshot(next));
      isRestoringRef.current = false;
      futureRef.current = future.slice(1);
      const past = [...pastRef.current, current];
      if (past.length > MAX_HISTORY) past.shift();
      pastRef.current = past;
      notify();
      return true;
    },
    [notify],
  );

  void revision;

  return {
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    commitBeforeMutation,
    undo,
    redo,
    reset,
    isRestoringRef,
  };
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}
