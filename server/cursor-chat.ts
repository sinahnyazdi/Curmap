import { Agent, AuthenticationError, CursorAgentError, type SDKAgent } from "@cursor/sdk";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Curmap } from "../shared/schema.js";
import { getCursorApiKey } from "./cursor-credentials.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "..");

type ChatSession = {
  agent: SDKAgent;
  agentId: string;
};

const sessions = new Map<string, ChatSession>();

function formatChatError(err: unknown, fallback: string): string {
  if (err instanceof AuthenticationError) {
    const status = "status" in err && typeof err.status === "number" ? err.status : null;
    if (status === 401) {
      return "Cursor rejected the API key (401). Open Settings and save a valid key from Cursor Integrations.";
    }
    return "Cursor rejected the API key. Open Settings and save a valid key from Cursor Integrations.";
  }
  if (err instanceof CursorAgentError) {
    const msg = err.message.trim();
    return msg && msg !== "Error" ? msg : fallback;
  }
  if (err instanceof Error) {
    const msg = err.message.trim();
    return msg && msg !== "Error" ? msg : fallback;
  }
  return fallback;
}

export async function isCursorConfigured(): Promise<boolean> {
  return Boolean(await getCursorApiKey());
}

async function requireApiKey(): Promise<string> {
  const key = await getCursorApiKey();
  if (!key) {
    throw new CursorAgentError("Cursor API key is not configured", {
      isRetryable: false,
    });
  }
  return key;
}

export async function clearAllChatSessions(): Promise<void> {
  const ids = [...sessions.keys()];
  for (const id of ids) {
    await resetChatSession(id);
  }
}

async function createAgent(): Promise<SDKAgent> {
  return Agent.create({
    apiKey: await requireApiKey(),
    model: { id: "composer-2.5" },
    local: {
      cwd: PROJECT_ROOT,
      settingSources: [],
    },
  });
}

async function getOrCreateAgent(curmapId: string): Promise<SDKAgent> {
  const existing = sessions.get(curmapId);
  if (existing) return existing.agent;

  const agent = await createAgent();
  sessions.set(curmapId, { agent, agentId: agent.agentId });
  return agent;
}

export async function resetChatSession(curmapId: string): Promise<void> {
  const session = sessions.get(curmapId);
  if (!session) return;
  await session.agent[Symbol.asyncDispose]();
  sessions.delete(curmapId);
}

function buildPrompt(curmap: Curmap, userMessage: string): string {
  const nodeSummary = curmap.nodes
    .slice(0, 40)
    .map((n) => `- ${n.id}: "${n.label}" (parent: ${n.parentId ?? "root"})`)
    .join("\n");

  const truncated =
    curmap.nodes.length > 40
      ? `\n… and ${curmap.nodes.length - 40} more nodes (read the JSON file for the full tree).`
      : "";

  return `You are editing Curmap mind maps in this workspace. Follow AGENTS.md for JSON rules.

Active map: "${curmap.title}" (id: ${curmap.id})
File to edit: curmaps/${curmap.id}.json

Only modify curmaps/${curmap.id}.json unless the user explicitly asks to work on another map. Keep a single root node (parentId: null). Update updatedAt on every change.

Current nodes (${curmap.nodes.length} total):
${nodeSummary}${truncated}

User request:
${userMessage}`;
}

export type ChatStreamEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool"; name: string; status: string }
  | { type: "done"; status: string; result?: string }
  | { type: "error"; message: string };

export async function streamCurmapChat(
  curmap: Curmap,
  userMessage: string,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<void> {
  const trimmed = userMessage.trim();
  if (!trimmed) {
    onEvent({ type: "error", message: "Message cannot be empty" });
    return;
  }

  let agent: SDKAgent;
  try {
    agent = await getOrCreateAgent(curmap.id);
  } catch (err) {
    const message = formatChatError(err, "Failed to start Cursor agent");
    onEvent({ type: "error", message });
    return;
  }

  const prompt = buildPrompt(curmap, trimmed);

  let run;
  try {
    run = await agent.send(prompt);
  } catch (err) {
    onEvent({ type: "error", message: formatChatError(err, "Failed to send message") });
    return;
  }

  try {
    for await (const event of run.stream()) {
      switch (event.type) {
        case "assistant":
          for (const block of event.message.content) {
            if (block.type === "text" && block.text) {
              onEvent({ type: "text", text: block.text });
            }
          }
          break;
        case "thinking":
          if (event.text) onEvent({ type: "thinking", text: event.text });
          break;
        case "tool_call":
          onEvent({
            type: "tool",
            name: event.name,
            status: event.status,
          });
          break;
        default:
          break;
      }
    }

    const result = await run.wait();
    if (result.status === "error") {
      onEvent({
        type: "error",
        message: result.result ?? "Agent run failed",
      });
      return;
    }

    onEvent({
      type: "done",
      status: result.status,
      result: result.result,
    });
  } catch (err) {
    onEvent({ type: "error", message: formatChatError(err, "Stream failed") });
  }
}
