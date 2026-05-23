import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getChatConfig, type ChatConfig } from "./api";
import { AppSettingsModal } from "./components/AppSettingsModal";

type AppSettingsContextValue = {
  openSettings: () => void;
  closeSettings: () => void;
  chatConfig: ChatConfig | null;
  refreshChatConfig: () => Promise<void>;
  setChatConfig: (config: ChatConfig) => void;
};

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [chatConfig, setChatConfig] = useState<ChatConfig | null>(null);

  const refreshChatConfig = useCallback(async () => {
    try {
      setChatConfig(await getChatConfig());
    } catch {
      setChatConfig((prev) =>
        prev ?? {
          configured: false,
          source: null,
          maskedKey: null,
          canManageInApp: true,
          storageError: null,
        },
      );
    }
  }, []);

  useEffect(() => {
    void refreshChatConfig();
  }, [refreshChatConfig]);

  const openSettings = useCallback(() => {
    void refreshChatConfig();
    setOpen(true);
  }, [refreshChatConfig]);

  const closeSettings = useCallback(() => setOpen(false), []);

  const handleChatConfigChange = useCallback((config: ChatConfig) => {
    setChatConfig(config);
  }, []);

  const value = useMemo(
    () => ({
      openSettings,
      closeSettings,
      chatConfig,
      refreshChatConfig,
      setChatConfig: handleChatConfigChange,
    }),
    [openSettings, closeSettings, chatConfig, refreshChatConfig, handleChatConfigChange],
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
      <AppSettingsModal
        open={open}
        onClose={closeSettings}
        chatConfig={chatConfig}
        onChatConfigChange={handleChatConfigChange}
      />
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings(): AppSettingsContextValue {
  const ctx = useContext(AppSettingsContext);
  if (!ctx) throw new Error("useAppSettings must be used within AppSettingsProvider");
  return ctx;
}
