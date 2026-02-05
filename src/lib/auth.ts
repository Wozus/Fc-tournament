import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

export const AUTH_COOKIE = "fife_session";

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function generateSalt() {
  return randomBytes(16).toString("hex");
}

export function hashPassword(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string
) {
  const computed = hashPassword(password, salt);
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(computed, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function newSessionToken() {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
