import { useEffect, useRef } from "react";
import { IconButton } from "./IconButton";
import { CloseIcon } from "./icons";

type Props = {
  open: boolean;
  onClose: () => void;
  onImportPick: () => void;
  importing: boolean;
};

export function ImportModal({ open, onClose, onImportPick, importing }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [onClose]);

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <form method="dialog" className="modal-panel" onSubmit={(e) => e.preventDefault()}>
        <header className="modal-header">
          <h2 className="modal-title">Import curmap</h2>
          <IconButton tooltip="Close" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </header>

        <div className="modal-body">
          <p className="hint">
            Import a curmap from a Markdown file (.md) — the same format downloaded with Export
            from the editor.
          </p>
          <p className="hint">
            If a curmap with the same id already exists, you will be asked whether to replace it.
          </p>
        </div>

        <footer className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={onImportPick}
            disabled={importing}
          >
            {importing ? "Importing…" : "Choose file"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
