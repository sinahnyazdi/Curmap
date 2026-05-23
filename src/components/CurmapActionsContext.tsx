import { createContext, useContext, type ReactNode } from "react";

type CurmapActions = {
  onToggleCollapse: (nodeId: string) => void;
};

const CurmapActionsContext = createContext<CurmapActions | null>(null);

export function CurmapActionsProvider({
  children,
  onToggleCollapse,
}: {
  children: ReactNode;
  onToggleCollapse: (nodeId: string) => void;
}) {
  return (
    <CurmapActionsContext.Provider value={{ onToggleCollapse }}>
      {children}
    </CurmapActionsContext.Provider>
  );
}

export function useCurmapActions(): CurmapActions {
  const ctx = useContext(CurmapActionsContext);
  if (!ctx) {
    throw new Error("useCurmapActions must be used within CurmapActionsProvider");
  }
  return ctx;
}
