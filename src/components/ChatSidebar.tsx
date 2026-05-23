import { useCallback, useEffect, useRef, useState } from "react";
import { useAppSettings } from "../AppSettingsProvider";
import { useStackedEditorPanels } from "../hooks/useStackedEditorPanels";
import { resetChatSession, streamCurmapChat, type ChatMessage } from "../api";
import {
  CHAT_SIDEBAR_COLLAPSED_KEY,
  getSidebarCollapsed,
  setSidebarCollapsed,
} from "../sidebarPrefs";
import { IconButton } from "./IconButton";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  PlusIcon,
  SendIcon,
  SettingsIcon,
  StopIcon,
} from "./icons";

type Props = {
  curmapId: string;
  curmapTitle: string;
  onCurmapUpdated: () => void;
};

export function ChatSidebar({ curmapId, curmapTitle, onCurmapUpdated }: Props) {
  const { chatConfig, openSettings } = useAppSettings();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const stackedPanels = useStackedEditorPanels();
  const [collapsed, setCollapsed] = useState(() => getSidebarCollapsed(CHAT_SIDEBAR_COLLAPSED_KEY));
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      setSidebarCollapsed(CHAT_SIDEBAR_COLLAPSED_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, statusLine]);

  const handleNewConversation = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setStatusLine(null);
    setMessages([]);
    try {
      await resetChatSession(curmapId);
    } catch {
      /* ignore */
    }
  }, [curmapId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming || !chatConfig?.configured) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setStreaming(true);
    setStatusLine("Working…");

    const assistantIndex = messages.length + 1;
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const controller = new AbortController();
    abortRef.current = controller;

    let assistantText = "";

    try {
      await streamCurmapChat(
        curmapId,
        text,
        {
          onText: (chunk) => {
            assistantText += chunk;
            setStatusLine(null);
            setMessages((prev) => {
              const next = [...prev];
              next[assistantIndex] = { role: "assistant", content: assistantText };
              return next;
            });
          },
          onThinking: () => setStatusLine("Working…"),
          onTool: (name, toolStatus) => setStatusLine(`${name} · ${toolStatus}`),
          onDone: () => {
            setStatusLine(null);
            onCurmapUpdated();
          },
          onError: (message) => {
            setStatusLine(null);
            setMessages((prev) => {
              const next = [...prev];
              next[assistantIndex] = {
                role: "assistant",
                content: assistantText || message,
                error: true,
              };
              return next;
            });
          },
        },
        controller.signal,
      );
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setStatusLine(null);
      setMessages((prev) => {
        const next = [...prev];
        next[assistantIndex] = {
          role: "assistant",
          content: err instanceof Error ? err.message : "Request failed",
          error: true,
        };
        return next;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    setStreaming(false);
    setStatusLine(null);
  };

  const configured = chatConfig?.configured ?? false;

  return (
    <aside className={`chat-sidebar${collapsed ? " chat-sidebar-collapsed" : ""}`}>
      <header className="chat-header">
        {collapsed ? (
          <span className="chat-collapsed-label" title={curmapTitle}>
            Assistant
          </span>
        ) : (
          <div className="chat-header-text">
            <h2 className="chat-title">Assistant</h2>
            <p className="chat-context">{curmapTitle}</p>
          </div>
        )}
        <div className="chat-toolbar">
          {!collapsed ? (
            <IconButton
              tooltip="New conversation"
              onClick={() => void handleNewConversation()}
              disabled={streaming}
            >
              <PlusIcon />
            </IconButton>
          ) : null}
          <IconButton
            tooltip={collapsed ? "Expand assistant" : "Collapse assistant"}
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
          >
            {stackedPanels ? (
              collapsed ? (
                <ChevronUpIcon />
              ) : (
                <ChevronDownIcon />
              )
            ) : collapsed ? (
              <ChevronLeftIcon />
            ) : (
              <ChevronRightIcon />
            )}
          </IconButton>
        </div>
      </header>

      {collapsed ? null : !configured ? (
        <div className="chat-banner">
          <span>API key required to use the assistant.</span>
          <IconButton tooltip="Open settings" onClick={openSettings}>
            <SettingsIcon />
          </IconButton>
        </div>
      ) : null}

      {collapsed ? null : (
      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <p className="chat-welcome-title">How can I help?</p>
            <p className="chat-welcome-body">
              Describe changes to this map—add branches, rename nodes, reorganize structure, or
              update notes. Edits are applied to the map file automatically.
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <article
              key={i}
              className={`chat-message chat-message-${m.role}${m.error ? " chat-message-error" : ""}`}
            >
              <div className="chat-message-meta">
                {m.role === "user" ? "You" : "Assistant"}
              </div>
              <div className="chat-message-content">
                {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
              </div>
            </article>
          ))
        )}
        {statusLine ? (
          <p className="chat-typing" role="status">
            {statusLine}
          </p>
        ) : null}
      </div>
      )}

      {collapsed ? null : (
      <form className="chat-composer" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            configured
              ? "Message the assistant…"
              : "Configure an API key in settings to continue"
          }
          rows={2}
          disabled={!configured || streaming}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit(e);
            }
          }}
        />
        <div className="chat-composer-bar">
          <span className="chat-composer-hint">Enter to send · Shift+Enter for newline</span>
          <div className="chat-composer-actions">
            {streaming ? (
              <IconButton tooltip="Stop generating" onClick={handleStop}>
                <StopIcon />
              </IconButton>
            ) : null}
            <IconButton
              type="submit"
              tooltip="Send message"
              className="btn icon-btn primary"
              disabled={!configured || streaming || !input.trim()}
            >
              <SendIcon />
            </IconButton>
          </div>
        </div>
      </form>
      )}
    </aside>
  );
}
