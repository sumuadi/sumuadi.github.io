// Lightweight self-signed HMAC token (header-less JWT-style: base64url(payload).base64url(signature)).
// Used both for the OAuth `state` param and for post-login session tokens, so we don't need
// server-side session storage between the redirect-based LINE Login flow and our Edge Functions.

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBytes(b64url: string): Uint8Array {
  const pad = "===".slice((b64url.length + 3) % 4);
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function getKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signToken(payload: Record<string, unknown>, secret: string): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${base64url(new Uint8Array(sig))}`;
}

export async function verifyToken<T>(token: string, secret: string): Promise<T | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const key = await getKey(secret);
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify("HMAC", key, base64urlToBytes(sig), encoder.encode(body));
  } catch {
    return null;
  }
  if (!valid) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64urlToBytes(body))) as T;
  } catch {
    return null;
  }
}
