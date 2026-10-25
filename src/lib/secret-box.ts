import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "./tenant";

// Encrypts secrets the user enters in the app (voice provider API keys) before they're stored in the database.
// The key comes from FUTUREME_SECRET, or else from a random key file made once next to the database, readable only
// by the server. Losing that file (or changing FUTUREME_SECRET) makes stored keys unreadable, so they're entered again.

const keys = new Map<string, Buffer>();

function keyFile(): string {
  return path.join(dataDir(), "secret.key");
}

function masterKey(): Buffer {
  const env = process.env.FUTUREME_SECRET?.trim();
  if (env) return crypto.createHash("sha256").update(env).digest();
  const file = keyFile();
  const cached = keys.get(file);
  if (cached) return cached;
  let key: Buffer;
  try {
    key = Buffer.from(fs.readFileSync(file, "utf8").trim(), "hex");
    if (key.length !== 32) throw new Error("bad key");
  } catch {
    key = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, key.toString("hex"), { mode: 0o600 });
  }
  keys.set(file, key);
  return key;
}

/** AES-256-GCM. The result is "v1:" plus base64 of iv, tag and ciphertext. */
export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64")}`;
}

/** The plain text, or null when it can't be decrypted (the server's key changed). */
export function unseal(sealed: string): string | null {
  if (!sealed.startsWith("v1:")) return null;
  try {
    const raw = Buffer.from(sealed.slice(3), "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
