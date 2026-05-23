import { useEffect, useRef } from "react";
import type { ChatConfig } from "../api";
import { AgentApiKeySettings } from "./AgentApiKeySettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { IconButton } from "./IconButton";
import { CloseIcon } from "./icons";

type Props = {
  open: boolean;
  onClose: () => void;
  chatConfig: ChatConfig | null;
  onChatConfigChange: (config: ChatConfig) => void;
};

export function AppSettingsModal({
  open,
  onClose,
  chatConfig,
  onChatConfigChange,
}: Props) {
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
      <div className="modal-panel modal-panel-wide">
        <header className="modal-header">
          <h2 className="modal-title">Settings</h2>
          <IconButton tooltip="Close" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </header>

        <div className="modal-body modal-body-sections">
          <AppearanceSettings />

          <hr className="settings-divider" />

          <div className="settings-section">
            <h3 className="settings-section-title">Assistant</h3>
            <p className="hint settings-hint">
              API access for the curmap assistant. Keys are stored on this device only.
            </p>
            {chatConfig ? (
              <AgentApiKeySettings config={chatConfig} onConfigChange={onChatConfigChange} />
            ) : (
              <p className="hint">Loading…</p>
            )}
          </div>
        </div>

        <footer className="modal-footer">
          <button type="button" className="btn primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </dialog>
  );
}
