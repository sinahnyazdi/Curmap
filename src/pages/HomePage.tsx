import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CurmapSummary } from "@shared/schema";
import {
  createCurmap,
  deleteCurmap,
  duplicateCurmap,
  ImportCurmapConflictError,
  importCurmapMarkdown,
  listCurmaps,
} from "../api";
import { SettingsButton } from "../components/SettingsButton";
import { ImportButton } from "../components/ImportButton";
import { ImportModal } from "../components/ImportModal";
import { CurmapListMenu } from "../components/CurmapListMenu";
import { curmapPath } from "../routes";

export function HomePage() {
  const navigate = useNavigate();
  const [summaries, setSummaries] = useState<CurmapSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSummaries(await listCurmaps());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setError(null);
    try {
      const created = await createCurmap({ title });
      setNewTitle("");
      await refresh();
      navigate(curmapPath(created.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    }
  };

  const importFile = async (file: File, force = false) => {
    setImporting(true);
    setError(null);
    try {
      const markdown = await file.text();
      const imported = await importCurmapMarkdown(markdown, {
        filename: file.name,
        force,
      });
      await refresh();
      navigate(curmapPath(imported.id));
    } catch (err) {
      if (err instanceof ImportCurmapConflictError) {
        const replace = confirm(
          `Map "${err.curmapId}" already exists. Replace it with "${file.name}"?`,
        );
        if (replace) {
          await importFile(file, true);
          return;
        }
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to import");
    } finally {
      setImporting(false);
    }
  };

  const handleImportPick = () => {
    importInputRef.current?.click();
  };

  const handleImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".md")) {
      setError("Import requires a .md file (use Export in the editor to create one).");
      return;
    }
    setImportOpen(false);
    await importFile(file);
  };

  const handleDuplicate = async (id: string) => {
    setError(null);
    try {
      const copy = await duplicateCurmap(id);
      await refresh();
      navigate(curmapPath(copy.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(`Delete map "${id}"?`)) return;
    try {
      await deleteCurmap(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-text">
          <p className="app-eyebrow">Workspace</p>
          <h1>Curmaps</h1>
          <p className="app-lead">
            Create and manage mind maps. Data lives in <code>curmaps/</code>.
          </p>
        </div>
        <div className="app-header-actions">
          <ImportButton onClick={() => setImportOpen(true)} />
          <SettingsButton />
        </div>
      </header>

      <input
        ref={importInputRef}
        type="file"
        accept=".md,text/markdown"
        hidden
        onChange={handleImportChange}
      />
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImportPick={handleImportPick}
        importing={importing}
      />

      <section className="create-card">
        <h2>New map</h2>
        <form onSubmit={handleCreate} className="create-form">
          <label>
            Name
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Project Plan"
              required
            />
          </label>
          <button type="submit" className="btn primary">
            Create
          </button>
        </form>
      </section>

      {error ? <div className="error">{error}</div> : null}

      <section className="list-card">
        <h2>Your maps</h2>
        {loading ? (
          <p className="loading-state" aria-busy="true">
            Loading…
          </p>
        ) : summaries.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-title">No maps yet</p>
            <p className="hint">Create one above or add a JSON file to <code>curmaps/</code>.</p>
          </div>
        ) : (
          <ul className="curmap-list">
            {summaries.map((m) => (
              <li key={m.id}>
                <Link to={curmapPath(m.id)} className="curmap-item">
                  <span className="curmap-item-title">{m.title}</span>
                  <span className="curmap-item-meta">
                    {m.id} · {new Date(m.updatedAt).toLocaleString()}
                  </span>
                </Link>
                <CurmapListMenu
                  onDuplicate={() => handleDuplicate(m.id)}
                  onDelete={() => handleDelete(m.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
