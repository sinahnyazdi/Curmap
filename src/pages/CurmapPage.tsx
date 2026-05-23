import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Curmap } from "@shared/schema";
import { getCurmap } from "../api";
import { CurmapEditor } from "../components/CurmapEditor";

export function CurmapPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [curmap, setCurmap] = useState<Curmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (curmapId: string) => {
    setLoading(true);
    setError(null);
    try {
      setCurmap(await getCurmap(curmapId));
    } catch (err) {
      setCurmap(null);
      setError(err instanceof Error ? err.message : "Failed to load map");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Missing curmap id");
      return;
    }
    void load(id);
  }, [id, load]);

  if (!id) {
    return (
      <div className="app">
        <p className="error">Invalid URL.</p>
        <Link to="/" className="btn">
          Back to list
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="app">
        <p className="loading-state" aria-busy="true">
          Loading…
        </p>
      </div>
    );
  }

  if (error || !curmap) {
    return (
      <div className="app">
        <header className="app-header">
          <div className="app-header-text">
            <h1>Curmap not found</h1>
            <p>{error ?? `No curmap with id "${id}".`}</p>
          </div>
        </header>
        <Link to="/" className="btn">
          ← Back to list
        </Link>
      </div>
    );
  }

  return (
    <CurmapEditor curmap={curmap} onReload={setCurmap} onBack={() => navigate("/")} />
  );
}
