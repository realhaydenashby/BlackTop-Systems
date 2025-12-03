import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    console.warn("[encryption] ENCRYPTION_KEY not set - using derived key from session secret");
    const fallbackSecret = process.env.SESSION_SECRET || "default-insecure-key-change-in-production";
    return crypto.scryptSync(fallbackSecret, "salt", 32);
  }
  
  if (key.length === 64) {
    return Buffer.from(key, "hex");
  }
  
  return crypto.scryptSync(key, "salt", 32);
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(":");
  
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format");
  }
  
  const [ivHex, authTagHex, encryptedHex] = parts;
  
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  return decrypted;
}

export function isEncrypted(value: string): boolean {
  if (!value) return false;
  const parts = value.split(":");
  if (parts.length !== 3) return false;
  
  const [ivHex, authTagHex] = parts;
  return ivHex.length === IV_LENGTH * 2 && authTagHex.length === AUTH_TAG_LENGTH * 2;
}

export function hashForLogging(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

export const encryptionService = {
  encrypt,
  decrypt,
  isEncrypted,
  hashForLogging,
};
