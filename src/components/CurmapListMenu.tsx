import { useEffect, useId, useRef, useState } from "react";
import { IconButton } from "./IconButton";
import { MoreIcon } from "./icons";

type Props = {
  onDuplicate: () => void;
  onDelete: () => void;
};

export function CurmapListMenu({ onDuplicate, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const close = () => setOpen(false);

    const onPointerDown = (e: PointerEvent) => {
      if (anchorRef.current?.contains(e.target as Node)) return;
      close();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div className="menu-anchor" ref={anchorRef}>
      <IconButton
        tooltip="More actions"
        tooltipPlacement="top"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreIcon />
      </IconButton>
      {open ? (
        <div id={menuId} className="menu-popover" role="menu">
          <button type="button" className="menu-item" role="menuitem" onClick={() => run(onDuplicate)}>
            Duplicate
          </button>
          <button
            type="button"
            className="menu-item danger"
            role="menuitem"
            onClick={() => run(onDelete)}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
