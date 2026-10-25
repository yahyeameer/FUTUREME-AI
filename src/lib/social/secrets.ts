import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../tenant";

// Encrypts account tokens before they touch the database (AES-256-GCM).
// The key comes from FUTUREME_SECRET_KEY. Without it, a random key is created once in a file next to the database
// (mode 0600). Either way the key never goes into SQLite, so the cloud copy of the database (cloud/sync.ts) only ever
// holds ciphertext.

const VERSION = "v1";

function keyFile(): string {
  return path.join(dataDir(), "secret.key");
}

let cached: { source: string; key: Buffer } | null = null;

export function secretKey(): { key: Buffer; source: "env" | "file" } {
  const env = process.env.FUTUREME_SECRET_KEY?.trim();
  if (env) {
    if (cached?.source !== `env:${env}`) cached = { source: `env:${env}`, key: crypto.createHash("sha256").update(env).digest() };
    return { key: cached.key, source: "env" };
  }
  const file = keyFile();
  if (cached?.source !== `file:${file}`) {
    let key: Buffer;
    if (fs.existsSync(file)) key = Buffer.from(fs.readFileSync(file, "utf8").trim(), "base64");
    else {
      key = crypto.randomBytes(32);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, key.toString("base64"), { mode: 0o600 });
    }
    cached = { source: `file:${file}`, key };
  }
  return { key: cached.key, source: "file" };
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey().key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** Null when the key changed or the value was tampered with: the account then needs connecting again. */
export function decryptSecret(sealed: string): string | null {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey().key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
