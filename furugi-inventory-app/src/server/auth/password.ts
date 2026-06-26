export type PasswordHashConfig = {
  iterations?: number;
  pepper?: string;
};

const algorithm = "pbkdf2-sha256";
const defaultIterations = 100_000;
const keyLengthBits = 256;

function getIterations(config: PasswordHashConfig = {}) {
  return config.iterations ?? defaultIterations;
}

function encodeBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a[index] ^ b[index];
  }
  return diff === 0;
}

function passwordMaterial(password: string, pepper = "") {
  return new TextEncoder().encode(`${pepper}${password}`);
}

async function deriveHash(password: string, salt: Uint8Array, config: PasswordHashConfig = {}) {
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordMaterial(password, config.pepper),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      hash: "SHA-256",
      iterations: getIterations(config),
      name: "PBKDF2",
      salt: saltBuffer,
    },
    keyMaterial,
    keyLengthBits,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string, config: PasswordHashConfig = {}) {
  const salt = randomBytes(16);
  const hash = await deriveHash(password, salt, config);
  return `${algorithm}$i=${getIterations(config)}$s=${encodeBase64Url(salt)}$h=${encodeBase64Url(hash)}`;
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
  config: PasswordHashConfig = {},
) {
  const parsed = parsePasswordHash(passwordHash);
  if (!parsed || parsed.algorithm !== algorithm) return false;
  const hash = await deriveHash(password, parsed.salt, {
    ...config,
    iterations: parsed.iterations,
  });
  return constantTimeEqual(hash, parsed.hash);
}

export function passwordHashNeedsUpgrade(passwordHash: string, config: PasswordHashConfig = {}) {
  const parsed = parsePasswordHash(passwordHash);
  return !parsed || parsed.algorithm !== algorithm || parsed.iterations < getIterations(config);
}

function parsePasswordHash(passwordHash: string) {
  const [hashAlgorithm, iterationPart, saltPart, hashPart] = passwordHash.split("$");
  const iterations = Number(iterationPart?.replace("i=", ""));
  const salt = saltPart?.replace("s=", "");
  const hash = hashPart?.replace("h=", "");
  if (!hashAlgorithm || !Number.isInteger(iterations) || !salt || !hash) return null;
  return {
    algorithm: hashAlgorithm,
    hash: decodeBase64Url(hash),
    iterations,
    salt: decodeBase64Url(salt),
  };
}
