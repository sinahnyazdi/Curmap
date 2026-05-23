import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
import {
  importCurmapFromMarkdown,
  curmapIdFromMarkdownFilename,
} from "../shared/import.js";
import {
  createEmptyCurmap,
  duplicateCurmap,
  curmapIdFromTitle,
  normalizeCurmapTitle,
  touchCurmap,
  validateCurmap,
  type Curmap,
  type CurmapSummary,
} from "../shared/schema.js";
import {
  clearAllChatSessions,
  isCursorConfigured,
  resetChatSession,
  streamCurmapChat,
  type ChatStreamEvent,
} from "./cursor-chat.js";
import {
  clearStoredCursorApiKey,
  getCursorCredentialConfig,
  saveCursorApiKey,
  validateApiKeyFormat,
} from "./cursor-credentials.js";
import { requireLocalCredentials } from "./local-only.js";

const CURMAPS_DIR = path.resolve(__dirname, "../curmaps");
const PORT = 3847;

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

function curmapFilePath(id: string) {
  return path.join(CURMAPS_DIR, `${id}.json`);
}

async function ensureDir() {
  await fs.mkdir(CURMAPS_DIR, { recursive: true });
}

async function readCurmap(id: string): Promise<Curmap | null> {
  try {
    const raw = await fs.readFile(curmapFilePath(id), "utf-8");
    return validateCurmap(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeCurmap(curmap: Curmap) {
  const valid = validateCurmap(curmap);
  await fs.writeFile(curmapFilePath(valid.id), JSON.stringify(valid, null, 2) + "\n", "utf-8");
  return valid;
}

async function listCurmapRecords(): Promise<Curmap[]> {
  await ensureDir();
  const files = await fs.readdir(CURMAPS_DIR);
  const maps: Curmap[] = [];
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const id = file.replace(/\.json$/, "");
    const curmap = await readCurmap(id);
    if (curmap) maps.push(curmap);
  }
  return maps;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/chat/config", async (_req, res) => {
  res.json(await getCursorCredentialConfig());
});

app.put("/api/chat/credentials", requireLocalCredentials, async (req, res) => {
  const { apiKey } = req.body as { apiKey?: string };
  if (typeof apiKey !== "string") {
    res.status(400).json({ error: "apiKey is required" });
    return;
  }

  const formatError = validateApiKeyFormat(apiKey);
  if (formatError) {
    res.status(400).json({ error: formatError });
    return;
  }

  try {
    await saveCursorApiKey(apiKey);
    await clearAllChatSessions();
    res.json(await getCursorCredentialConfig());
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to save API key",
    });
  }
});

app.delete("/api/chat/credentials", requireLocalCredentials, async (_req, res) => {
  try {
    await clearStoredCursorApiKey();
    await clearAllChatSessions();
    res.json(await getCursorCredentialConfig());
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to remove API key",
    });
  }
});

function writeSse(res: express.Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

app.post("/api/chat/:curmapId", async (req, res) => {
  const curmapId = req.params.curmapId;
  const { message } = req.body as { message?: string };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  if (!(await isCursorConfigured())) {
    res.status(503).json({
      error: "Cursor API key is not configured. Add one in the chat sidebar settings.",
    });
    return;
  }

  const curmap = await readCurmap(curmapId);
  if (!curmap) {
    res.status(404).json({ error: "Curmap not found" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: ChatStreamEvent) => {
    switch (event.type) {
      case "text":
        writeSse(res, "text", { text: event.text });
        break;
      case "thinking":
        writeSse(res, "thinking", {});
        break;
      case "tool":
        writeSse(res, "tool", { name: event.name, status: event.status });
        break;
      case "done":
        writeSse(res, "done", { status: event.status, result: event.result });
        break;
      case "error":
        writeSse(res, "error", { message: event.message });
        break;
    }
  };

  try {
    await streamCurmapChat(curmap, message, send);
    res.end();
  } catch (err) {
    writeSse(res, "error", {
      message: err instanceof Error ? err.message : "Chat failed",
    });
    res.end();
  }
});

app.delete("/api/chat/:curmapId", async (req, res) => {
  await resetChatSession(req.params.curmapId);
  res.status(204).send();
});

app.get("/api/curmaps", async (_req, res) => {
  await ensureDir();
  const files = await fs.readdir(CURMAPS_DIR);
  const summaries: CurmapSummary[] = [];

  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const id = file.replace(/\.json$/, "");
    const curmap = await readCurmap(id);
    if (curmap) {
      summaries.push({
        id: curmap.id,
        title: curmap.title,
        description: curmap.description,
        updatedAt: curmap.updatedAt,
      });
    }
  }

  summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  res.json(summaries);
});

app.get("/api/curmaps/:id", async (req, res) => {
  const curmap = await readCurmap(req.params.id);
  if (!curmap) {
    res.status(404).json({ error: "Curmap not found" });
    return;
  }
  res.json(curmap);
});

app.post("/api/curmaps/import", async (req, res) => {
  const { markdown, filename, force } = req.body as {
    markdown?: string;
    filename?: string;
    force?: boolean;
  };

  if (typeof markdown !== "string" || !markdown.trim()) {
    res.status(400).json({ error: "markdown is required" });
    return;
  }

  const idFromName =
    typeof filename === "string" ? curmapIdFromMarkdownFilename(filename) : undefined;
  const footerId = markdown.match(/\*([^·]+) · updated /)?.[1]?.trim();
  const resolvedId = footerId ?? idFromName;

  let existing: Curmap | null = null;
  if (resolvedId) {
    existing = await readCurmap(resolvedId);
  }

  try {
    const curmap = importCurmapFromMarkdown(markdown, {
      id: resolvedId,
      preserveFrom: existing ?? undefined,
    });

    if (existing && !force) {
      res.status(409).json({
        error: `Curmap "${curmap.id}" already exists`,
        id: curmap.id,
      });
      return;
    }

    await ensureDir();
    await writeCurmap(curmap);
    res.status(existing ? 200 : 201).json(curmap);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Invalid markdown",
    });
  }
});

app.post("/api/curmaps/:id/duplicate", async (req, res) => {
  const sourceId = req.params.id;
  const source = await readCurmap(sourceId);
  if (!source) {
    res.status(404).json({ error: "Curmap not found" });
    return;
  }

  const { title } = req.body as { title?: string };
  if (title !== undefined && !title.trim()) {
    res.status(400).json({ error: "title cannot be empty" });
    return;
  }

  const existing = await listCurmapRecords();
  const idTaken = (id: string) => existing.some((m) => m.id === id);
  const titleTaken = (normalized: string) =>
    existing.some((m) => normalizeCurmapTitle(m.title) === normalized);

  try {
    const copy = duplicateCurmap(source, {
      title: title?.trim(),
      idTaken,
      titleTaken,
    });
    await writeCurmap(copy);
    res.status(201).json(copy);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Failed to duplicate map",
    });
  }
});

app.post("/api/curmaps", async (req, res) => {
  const { title, description } = req.body as {
    title?: string;
    description?: string;
  };

  const trimmedTitle = title?.trim();
  if (!trimmedTitle) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const id = curmapIdFromTitle(trimmedTitle);
  if (!id) {
    res.status(400).json({
      error: "Title must contain at least one letter or number",
    });
    return;
  }

  const existing = await readCurmap(id);
  if (existing) {
    res.status(409).json({ error: "A curmap with this name already exists" });
    return;
  }

  await ensureDir();
  const normalizedTitle = normalizeCurmapTitle(trimmedTitle);
  const files = await fs.readdir(CURMAPS_DIR);
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const other = await readCurmap(file.replace(/\.json$/, ""));
    if (other && normalizeCurmapTitle(other.title) === normalizedTitle) {
      res.status(409).json({ error: "A curmap with this name already exists" });
      return;
    }
  }

  const curmap = createEmptyCurmap(id, trimmedTitle);
  if (description) curmap.description = description;

  await writeCurmap(curmap);
  res.status(201).json(curmap);
});

app.put("/api/curmaps/:id", async (req, res) => {
  const id = req.params.id;
  const existing = await readCurmap(id);
  if (!existing) {
    res.status(404).json({ error: "Curmap not found" });
    return;
  }

  try {
    const incoming = validateCurmap({ ...req.body, id });
    if (incoming.id !== id) {
      res.status(400).json({ error: "id in body must match URL" });
      return;
    }
    const updated = touchCurmap({ ...incoming, createdAt: existing.createdAt });
    await writeCurmap(updated);
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid curmap" });
  }
});

app.delete("/api/curmaps/:id", async (req, res) => {
  const id = req.params.id;
  try {
    await fs.unlink(curmapFilePath(id));
    res.status(204).send();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      res.status(404).json({ error: "Curmap not found" });
      return;
    }
    throw err;
  }
});

await ensureDir();
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Curmap API running at http://127.0.0.1:${PORT}`);
});
