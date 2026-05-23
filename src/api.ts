import type { Curmap, CurmapSummary } from "@shared/schema";

const API = "/api";

export async function listCurmaps(): Promise<CurmapSummary[]> {
  const res = await fetch(`${API}/curmaps`);
  if (!res.ok) throw new Error("Failed to list maps");
  return res.json();
}

export async function getCurmap(id: string): Promise<Curmap> {
  const res = await fetch(`${API}/curmaps/${id}`);
  if (!res.ok) throw new Error(`Failed to load map "${id}"`);
  return res.json();
}

export async function createCurmap(data: {
  title: string;
  description?: string;
}): Promise<Curmap> {
  const res = await fetch(`${API}/curmaps`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Failed to create map");
  }
  return res.json();
}

export async function saveCurmap(curmap: Curmap): Promise<Curmap> {
  const res = await fetch(`${API}/curmaps/${curmap.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(curmap),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? "Failed to save map");
  }
  return res.json();
}

export async function deleteCurmap(id: string): Promise<void> {
  const res = await fetch(`${API}/curmaps/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Failed to delete map "${id}"`);
}

export async function duplicateCurmap(
  id: string,
  options: { title?: string } = {},
): Promise<Curmap> {
  const res = await fetch(`${API}/curmaps/${id}/duplicate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Failed to duplicate map "${id}"`);
  }
  return res.json();
}

export type ImportCurmapOptions = {
  filename?: string;
  force?: boolean;
};

export class ImportCurmapConflictError extends Error {
  readonly curmapId: string;

  constructor(message: string, curmapId: string) {
    super(message);
    this.name = "ImportCurmapConflictError";
    this.curmapId = curmapId;
  }
}

export async function importCurmapMarkdown(
  markdown: string,
  options: ImportCurmapOptions = {},
): Promise<Curmap> {
  const res = await fetch(`${API}/curmaps/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      markdown,
      filename: options.filename,
      force: options.force,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; id?: string };
  if (res.status === 409 && typeof body.id === "string") {
    throw new ImportCurmapConflictError(body.error ?? "Map already exists", body.id);
  }
  if (!res.ok) {
    throw new Error(body.error ?? "Failed to import map");
  }
  return body as Curmap;
}

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
};

export type ChatConfig = {
  configured: boolean;
  source: "env" | "stored" | null;
  maskedKey: string | null;
  canManageInApp: boolean;
  storageError?: string | null;
};

export async function getChatConfig(): Promise<ChatConfig> {
  const res = await fetch(`${API}/chat/config`);
  if (!res.ok) throw new Error("Failed to load chat config");
  return res.json();
}

export async function saveCursorCredentials(apiKey: string): Promise<ChatConfig> {
  const res = await fetch(`${API}/chat/credentials`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to save API key");
  }
  return res.json();
}

export async function clearCursorCredentials(): Promise<ChatConfig> {
  const res = await fetch(`${API}/chat/credentials`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Failed to remove API key");
  }
  return res.json();
}

export async function resetChatSession(curmapId: string): Promise<void> {
  const res = await fetch(`${API}/chat/${curmapId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to reset chat session");
}

type ChatStreamHandlers = {
  onText: (chunk: string) => void;
  onThinking?: () => void;
  onTool?: (name: string, status: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
};

export async function streamCurmapChat(
  curmapId: string,
  message: string,
  handlers: ChatStreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API}/chat/${curmapId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    handlers.onError((err as { error?: string }).error ?? "Chat request failed");
    return;
  }

  if (!res.body) {
    handlers.onError("No response stream");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (block: string) => {
    const lines = block.split("\n");
    let event = "message";
    let data = "";

    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }

    if (!data) return;

    try {
      const payload = JSON.parse(data) as Record<string, unknown>;
      switch (event) {
        case "text":
          if (typeof payload.text === "string") handlers.onText(payload.text);
          break;
        case "thinking":
          handlers.onThinking?.();
          break;
        case "tool":
          if (typeof payload.name === "string" && typeof payload.status === "string") {
            handlers.onTool?.(payload.name, payload.status);
          }
          break;
        case "done":
          handlers.onDone();
          break;
        case "error":
          handlers.onError(
            typeof payload.message === "string" ? payload.message : "Agent error",
          );
          break;
        default:
          break;
      }
    } catch {
      /* ignore malformed SSE */
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      dispatch(block);
      boundary = buffer.indexOf("\n\n");
    }
  }

  if (buffer.trim()) dispatch(buffer);
}
