import { useEffect, useState } from "react";

/** Matches editor stacked layout in index.css (@media max-width: 768px). */
const STACKED_PANELS_QUERY = "(max-width: 768px)";

export function useStackedEditorPanels(): boolean {
  const [stacked, setStacked] = useState(
    () => typeof window !== "undefined" && window.matchMedia(STACKED_PANELS_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(STACKED_PANELS_QUERY);
    const onChange = () => setStacked(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return stacked;
}
