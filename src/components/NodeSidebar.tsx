import { useCallback, useEffect, useState } from "react";
import {
  getSidebarCollapsed,
  NODE_SIDEBAR_COLLAPSED_KEY,
  setSidebarCollapsed,
} from "../sidebarPrefs";
import { IconButton } from "./IconButton";
import { useStackedEditorPanels } from "../hooks/useStackedEditorPanels";
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon } from "./icons";

type Props = {
  selectedId: string | null;
  label: string;
  notes: string;
  onLabelChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onApply: () => void;
};

export function NodeSidebar({
  selectedId,
  label,
  notes,
  onLabelChange,
  onNotesChange,
  onApply,
}: Props) {
  const stackedPanels = useStackedEditorPanels();
  const [collapsed, setCollapsed] = useState(() =>
    getSidebarCollapsed(NODE_SIDEBAR_COLLAPSED_KEY),
  );

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      setSidebarCollapsed(NODE_SIDEBAR_COLLAPSED_KEY, next);
      return next;
    });
  }, []);

  const expand = useCallback(() => {
    setCollapsed((prev) => {
      if (!prev) return prev;
      setSidebarCollapsed(NODE_SIDEBAR_COLLAPSED_KEY, false);
      return false;
    });
  }, []);

  useEffect(() => {
    if (selectedId) expand();
  }, [selectedId, expand]);

  return (
    <aside className={`sidebar${collapsed ? " sidebar-collapsed" : ""}`}>
      <header className="sidebar-header">
        {collapsed ? (
          <span className="sidebar-collapsed-label">Node</span>
        ) : (
          <div className="sidebar-header-text">
            <h2 className="sidebar-title">Node</h2>
          </div>
        )}
        <div className="sidebar-toolbar">
          <IconButton
            tooltip={collapsed ? "Expand node panel" : "Collapse node panel"}
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
          >
            {stackedPanels ? (
              collapsed ? (
                <ChevronDownIcon />
              ) : (
                <ChevronUpIcon />
              )
            ) : collapsed ? (
              <ChevronRightIcon />
            ) : (
              <ChevronLeftIcon />
            )}
          </IconButton>
        </div>
      </header>

      {collapsed ? null : (
        <div className="sidebar-body">
          {selectedId ? (
            <div className="sidebar-form">
              <label>
                Label
                <input value={label} onChange={(e) => onLabelChange(e.target.value)} />
              </label>
              <label>
                Notes
                <textarea
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                  rows={4}
                />
              </label>
              <div className="sidebar-actions">
                <button type="button" className="btn primary" onClick={onApply}>
                  Apply to node
                </button>
              </div>
              <p className="sidebar-node-id">
                <span className="sidebar-node-id-label">ID</span>
                {selectedId}
              </p>
            </div>
          ) : (
            <p className="sidebar-empty hint">Click a node to edit it, or add a child.</p>
          )}
        </div>
      )}
    </aside>
  );
}
