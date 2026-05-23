import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo, type CSSProperties } from "react";
import { IconButton } from "./IconButton";
import { useCurmapActions } from "./CurmapActionsContext";
import { ChevronDownIcon, ChevronRightIcon } from "./icons";

type CurmapNodeData = {
  label: string;
  notes: string;
  collapsed?: boolean;
  hasChildren?: boolean;
  /** Resolved accent (hex) from node color + inheritance */
  accent?: string;
};

function CurmapNodeComponent({ id, data, selected }: NodeProps) {
  const { label, notes, collapsed, hasChildren, accent } = data as CurmapNodeData;
  const { onToggleCollapse } = useCurmapActions();

  const style = accent
    ? ({
        "--node-accent": accent,
      } as CSSProperties)
    : undefined;

  return (
    <div
      className={`curmap-node${accent ? " colored" : ""}${selected ? " selected" : ""}`}
      style={style}
    >
      <Handle type="target" position={Position.Left} />
      <div className="curmap-node-header">
        <div className="curmap-node-label">{label}</div>
        {hasChildren ? (
          <IconButton
            tooltip={collapsed ? "Expand branch" : "Collapse branch"}
            className="curmap-node-collapse"
            aria-expanded={!collapsed}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse(id);
            }}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
          </IconButton>
        ) : null}
      </div>
      {notes ? <div className="curmap-node-notes">{notes}</div> : null}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const CurmapNode = memo(CurmapNodeComponent);
