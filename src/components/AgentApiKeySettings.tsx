import { useCallback, useState } from "react";
import {
  clearCursorCredentials,
  saveCursorCredentials,
  type ChatConfig,
} from "../api";

type Props = {
  config: ChatConfig;
  onConfigChange: (config: ChatConfig) => void;
  disabled?: boolean;
};

export function AgentApiKeySettings({ config, onConfigChange, disabled }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [showForm, setShowForm] = useState(
    () => !config.configured || Boolean(config.storageError),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshConfig = useCallback(
    async (updater: () => Promise<ChatConfig>) => {
      setSaving(true);
      setError(null);
      try {
        const next = await updater();
        onConfigChange(next);
        setApiKey("");
        if (next.configured) setShowForm(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update API key");
      } finally {
        setSaving(false);
      }
    },
    [onConfigChange],
  );

  const handleSave = async () => {
    await refreshConfig(() => saveCursorCredentials(apiKey));
  };

  const handleRemove = async () => {
    if (!confirm("Remove the saved API key from this computer?")) return;
    await refreshConfig(() => clearCursorCredentials());
    setShowForm(true);
  };

  if (config.configured && config.source === "env") {
    return (
      <div className="settings-subsection">
        <p className="settings-text">
          Using <code>CURSOR_API_KEY</code> from the server environment ({config.maskedKey}).
        </p>
        <p className="hint settings-hint">
          To manage the key here, unset the environment variable and restart the API server.
        </p>
      </div>
    );
  }

  return (
    <div className="settings-subsection">
      {config.storageError ? (
        <p className="settings-error">{config.storageError}</p>
      ) : null}

      {config.configured && config.source === "stored" && !showForm ? (
        <div className="settings-key-saved">
          <p className="settings-text">
            Active key: <span className="settings-key-mask">{config.maskedKey}</span>
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className="btn small"
              disabled={disabled || saving}
              onClick={() => setShowForm(true)}
            >
              Change
            </button>
            <button
              type="button"
              className="btn small danger"
              disabled={disabled || saving}
              onClick={() => void handleRemove()}
            >
              Remove
            </button>
          </div>
        </div>
      ) : null}

      {showForm || !config.configured ? (
        <div className="settings-form">
          <label>
            API key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="crsr_…"
              autoComplete="off"
              spellCheck={false}
              disabled={disabled || saving}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSave();
                }
              }}
            />
          </label>
          <p className="hint settings-hint">
            Saved under <code>~/.curmap/</code> with restricted permissions.{" "}
            <a
              href="https://cursor.com/dashboard/integrations"
              target="_blank"
              rel="noreferrer"
            >
              Create a key
            </a>
          </p>
          {error ? <p className="settings-error">{error}</p> : null}
          <button
            type="button"
            className="btn primary"
            disabled={disabled || saving || !apiKey.trim()}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
