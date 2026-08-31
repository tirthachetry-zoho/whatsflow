import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const source = process.env.APP_ENCRYPTION_KEY || process.env.AUTH_SECRET || "freebuff-dev-key";
  return crypto.createHash("sha256").update(source).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted payload format.");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64!, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64!, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}

export function maskSecret(value: string): string {
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
