/**
 * RFC 4226 (HOTP) / RFC 6238 (TOTP) code generation for test-only use —
 * computes a real, valid 6-digit authenticator code from a base32 secret
 * returned by Supabase Auth's own `auth.mfa.enroll()` API, so integration
 * tests can complete a genuine password -> TOTP challenge/verify round trip
 * against a real local Supabase Auth instance without a human typing a code
 * from an authenticator app. No cryptographic shortcut is taken — this is
 * the same algorithm any real authenticator app implements; only the input
 * (a test-only secret from a disposable local enrollment) is test-specific.
 */
import { createHmac } from "node:crypto";

function base32Decode(base32: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32.replace(/=+$/, "").toUpperCase()) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(
  base32Secret: string,
  {
    timeStepSeconds = 30,
    digits = 6,
    forTime = Date.now(),
  }: { timeStepSeconds?: number; digits?: number; forTime?: number } = {},
): string {
  const key = base32Decode(base32Secret);
  const counter = Math.floor(forTime / 1000 / timeStepSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}
