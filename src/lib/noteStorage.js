// src/lib/noteStorage.js
// Utility for encrypted browser storage of shielded notes (UTXOs)

const STORAGE_KEY = "shieldedNotesEncrypted";
const SALT = "shielded-notes-salt"; // constant salt for PBKDF2

async function deriveKey(password) {
  const enc = new TextEncoder();
  const saltBytes = enc.encode(SALT);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptData(password, data) {
  const key = await deriveKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(data));

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );

  const ivBase64 = btoa(String.fromCharCode(...iv));
  const ctArray = new Uint8Array(ciphertext);
  const ctBase64 = btoa(String.fromCharCode(...ctArray));

  return JSON.stringify({ iv: ivBase64, data: ctBase64 });
}

async function decryptData(password, stored) {
  try {
    const { iv: ivBase64, data: ctBase64 } = JSON.parse(stored);
    const key = await deriveKey(password);

    const ivBytes = Uint8Array.from(atob(ivBase64), (c) =>
      c.charCodeAt(0)
    );
    const ctBytes = Uint8Array.from(atob(ctBase64), (c) =>
      c.charCodeAt(0)
    );

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes },
      key,
      ctBytes
    );
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(plaintext));
  } catch {
    return null;
  }
}

// Each note: { id, amount, nullifier, timestamp, spent }
// Generate a random 32-byte hex string as nullifier
export function generateNullifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes)
    .map((b) => b.toString(32).padStart(2, "0"))
    .join("");
}

export async function loadNotes(publicKey) {
  const stored = localStorage.getItem(STORAGE_KEY + "_" + publicKey);
  if (!stored) return [];
  const notes = await decryptData(publicKey, stored);
  return notes || [];
}

export async function saveNotes(publicKey, notes) {
  const encrypted = await encryptData(publicKey, notes);
  localStorage.setItem(STORAGE_KEY + "_" + publicKey, encrypted);
}
