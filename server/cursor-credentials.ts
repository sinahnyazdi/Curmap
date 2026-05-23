import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const LEGACY_CREDENTIALS_DIR = path.join(os.homedir(), ".mindmap");
const CREDENTIALS_DIR = path.join(os.homedir(), ".curmap");

/** One-time rename from pre-Curmap `~/.mindmap/` credential storage. */
async function migrateLegacyCredentialsDir(): Promise<void> {
  try {
    await fs.access(CREDENTIALS_DIR);
    return;
  } catch {
    /* new dir missing */
  }
  try {
    await fs.access(LEGACY_CREDENTIALS_DIR);
    await fs.rename(LEGACY_CREDENTIALS_DIR, CREDENTIALS_DIR);
  } catch {
    /* no legacy dir */
  }
}
const ENCRYPTION_KEY_FILE = path.join(CREDENTIALS_DIR, ".encryption-key");
const API_KEY_FILE = path.join(CREDENTIALS_DIR, "cursor-api-key.enc");

export type CursorCredentialSource = "env" | "stored";

export type CursorCredentialConfig = {
  configured: boolean;
  source: CursorCredentialSource | null;
  maskedKey: string | null;
  canManageInApp: boolean;
  /** Present when a key file exists but cannot be decrypted (e.g. encryption key mismatch). */
  storageError?: string | null;
};

let cachedStoredKey: string | null | undefined;

function maskApiKey(key: string): string {
  if (key.length <= 16) return "crsr_••••";
  return `${key.slice(0, 10)}…${key.slice(-6)}`;
}

const STORAGE_UNREADABLE_MESSAGE =
  "A saved API key could not be read from disk. Save it again to replace the file.";

const API_KEY_PREFIX = /^(crsr_|cursor[_-])/i;

export function isValidApiKeyPrefix(key: string): boolean {
  return API_KEY_PREFIX.test(key.trim());
}

function envApiKey(): string | null {
  const key = process.env.CURSOR_API_KEY?.trim();
  return key || null;
}

async function readEncryptionKey(): Promise<Buffer> {
  await migrateLegacyCredentialsDir();
  try {
    const key = await fs.readFile(ENCRYPTION_KEY_FILE);
    if (key.length !== 32) throw new Error("invalid key length");
    return key;
  } catch {
    const key = crypto.randomBytes(32);
    await fs.mkdir(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
    await fs.writeFile(ENCRYPTION_KEY_FILE, key, { mode: 0o600 });
    return key;
  }
}

async function encrypt(plaintext: string): Promise<string> {
  const key = await readEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

async function decrypt(payload: string): Promise<string> {
  const key = await readEncryptionKey();
  const buf = Buffer.from(payload.trim(), "base64");
  if (buf.length < 29) throw new Error("invalid payload");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

async function storedApiKeyFileExists(): Promise<boolean> {
  try {
    await fs.access(API_KEY_FILE);
    return true;
  } catch {
    return false;
  }
}

async function loadStoredApiKeyFromDisk(): Promise<string | null> {
  try {
    const enc = await fs.readFile(API_KEY_FILE, "utf8");
    const key = (await decrypt(enc)).trim();
    return key || null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function readStoredApiKey(): Promise<string | null> {
  if (cachedStoredKey !== undefined) return cachedStoredKey;
  try {
    cachedStoredKey = await loadStoredApiKeyFromDisk();
    return cachedStoredKey;
  } catch {
    cachedStoredKey = null;
    return null;
  }
}

export async function getCursorApiKey(): Promise<string | null> {
  const fromEnv = envApiKey();
  if (fromEnv) return fromEnv;
  return readStoredApiKey();
}

export async function getCursorCredentialConfig(): Promise<CursorCredentialConfig> {
  const fromEnv = envApiKey();
  if (fromEnv) {
    return {
      configured: true,
      source: "env",
      maskedKey: maskApiKey(fromEnv),
      canManageInApp: false,
      storageError: null,
    };
  }

  const fileExists = await storedApiKeyFileExists();
  if (!fileExists) {
    cachedStoredKey = undefined;
    return {
      configured: false,
      source: null,
      maskedKey: null,
      canManageInApp: true,
      storageError: null,
    };
  }

  try {
    const stored = await loadStoredApiKeyFromDisk();
    if (stored) {
      cachedStoredKey = stored;
      return {
        configured: true,
        source: "stored",
        maskedKey: maskApiKey(stored),
        canManageInApp: true,
        storageError: null,
      };
    }
  } catch {
    /* unreadable */
  }

  cachedStoredKey = undefined;
  return {
    configured: false,
    source: null,
    maskedKey: null,
    canManageInApp: true,
    storageError: STORAGE_UNREADABLE_MESSAGE,
  };
}

export function validateApiKeyFormat(apiKey: string): string | null {
  const trimmed = apiKey.trim();
  if (!trimmed) return "API key is required";
  if (trimmed.length < 20) return "API key looks too short";
  if (!isValidApiKeyPrefix(trimmed)) {
    return 'API key should start with "crsr_" (from Cursor Integrations)';
  }
  return null;
}

export async function saveCursorApiKey(apiKey: string): Promise<void> {
  const formatError = validateApiKeyFormat(apiKey);
  if (formatError) throw new Error(formatError);

  const trimmed = apiKey.trim();
  await fs.mkdir(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });
  const enc = await encrypt(trimmed);
  await fs.writeFile(API_KEY_FILE, `${enc}\n`, { mode: 0o600 });
  cachedStoredKey = undefined;
  const verified = await loadStoredApiKeyFromDisk();
  if (verified !== trimmed) {
    throw new Error("Saved API key could not be read back from disk");
  }
  cachedStoredKey = trimmed;
}

export async function clearStoredCursorApiKey(): Promise<void> {
  cachedStoredKey = undefined;
  try {
    await fs.unlink(API_KEY_FILE);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
