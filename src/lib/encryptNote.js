// encryptMemoSuffix.js

import nacl from "tweetnacl";
import * as ed2curve from "ed2curve";
import { hkdf } from "@stablelib/hkdf";
import { sha256 } from "@stablelib/sha256";
import { ChaCha20Poly1305 } from "@stablelib/chacha20poly1305";
import { PublicKey } from "@solana/web3.js";

/**
 * Builds an encrypted JSON suffix containing { value, nullifier, assetId }.
 * 
 * 1) Derives the recipient’s Curve25519 public key from their Solana (Ed25519) address.
 * 2) Asks Phantom to sign the fixed message "derive‐curve‐priv" → 64-byte signature →
 *    HKDF→clamp → 32-byte X25519 private. (One Phantom popup.)
 * 3) Encrypts { value, nullifier, assetId } under ChaCha20-Poly1305 with a fresh ephemeral X25519 key.
 * 4) Returns a UTF-8 JSON string:
 *    { "ephemeralPub": "...", "nonce12": "...", "cipherText": "...", "authTag": "..." }
 * 
 * You can append the returned string to your existing memo payload.
 */
export async function buildEncryptedSuffix(
  phantom,              // window.solana (Phantom)
  recipientEdPub,       // recipient’s Solana address (base58 string)
  value,                // number or string or BigInt
  nullifier,            // string
  assetId               // string
) {
  if (!phantom || !phantom.isPhantom) {
    throw new Error("Phantom not found. Please install and connect Phantom.");
  }

  // A) Build the JSON payload to encrypt
  const payload = {
    value: value.toString(),
    nullifier: nullifier,
    assetId: assetId.toString()
  };
  const plaintextUtf8 = JSON.stringify(payload);

  // B) Convert recipient’s Ed25519 pub → Curve25519 pub
  const edPubBytes = new PublicKey(recipientEdPub).toBytes(); // 32 bytes
  const curvePubB = ed2curve.convertPublicKey(edPubBytes);
  if (!curvePubB) {
    throw new Error("Failed to convert recipient’s Ed25519 public key to Curve25519.");
  }

  // C) Derive recipient’s X25519 private by signing a fixed message once
  const msgBytes = new TextEncoder().encode("derive‐curve‐priv");
  const { signature: sig64 } = await phantom.signMessage(msgBytes, "utf8");
  if (sig64.length !== 64) {
    throw new Error("Unexpected signature length from Phantom.");
  }
  // HKDF-SHA256(sig64) → 32 bytes → clamp to valid X25519 scalar
  const salt = new Uint8Array(0);
  const info = new TextEncoder().encode("ed2curve-derivation");
  const raw32 = new Uint8Array(32);
  await hkdf(sha256, salt, sig64, info, raw32);
  raw32[0]  &= 248;
  raw32[31] &= 127;
  raw32[31] |= 64;
  // const curvePrivB = raw32; // 32-byte X25519 private

  // D) Generate ephemeral Curve25519 keypair for the sender
  const ephKP = nacl.box.keyPair();
  const ephPrivA = ephKP.secretKey;  // 32 bytes
  const ephPubA  = ephKP.publicKey;  // 32 bytes

  // E) Compute shared = X25519(ephPrivA, curvePubB)
  const shared32 = nacl.scalarMult(ephPrivA, curvePubB); // 32 bytes

  // F) HKDF(shared32) → 32-byte ChaCha key
  const hkSalt = new Uint8Array(0);
  const hkInfo = new TextEncoder().encode("chacha-message");
  const chachaKey = new Uint8Array(32);
  await hkdf(sha256, hkSalt, shared32, hkInfo, chachaKey);

  // G) Encrypt plaintextUtf8 with ChaCha20-Poly1305 under chachaKey + random nonce
  const nonce12 = new Uint8Array(12);
  crypto.getRandomValues(nonce12);
  const chacha = new ChaCha20Poly1305(chachaKey);
  const plainBytes = new TextEncoder().encode(plaintextUtf8);
  const sealed = chacha.seal(nonce12, plainBytes, new Uint8Array(0));
  // sealed = ciphertext‖16-byte tag
  const ctLen = sealed.length - 16;
  const cipherText = sealed.subarray(0, ctLen);
  const authTag    = sealed.subarray(ctLen);

  // H) Base64-encode and return a JSON string
  const envelope = {
    ephemeralPub: Buffer.from(ephPubA).toString("base64"),
    nonce12:      Buffer.from(nonce12).toString("base64"),
    cipherText:   Buffer.from(cipherText).toString("base64"),
    authTag:      Buffer.from(authTag).toString("base64")
  };

  return JSON.stringify(envelope);
}

// decryptMemoSuffix.js

/**
 * Given a JSON‐stringified envelope (with base64 fields: ephemeralPub, nonce12, cipherText, authTag),
 * this function:
 * 1) Asks Phantom to sign "derive‐curve‐priv" to derive the recipient’s X25519 private key.
 * 2) Parses the envelope, base64‐decodes its fields.
 * 3) Performs X25519(shared) = scalarMult(curvePriv, ephemeralPub).
 * 4) HKDF(shared) → 32‐byte ChaCha20 key.
 * 5) ChaCha20‐Poly1305‐unseal(cipherText, authTag, nonce12).
 * 6) Parses the resulting UTF‐8 JSON to { value, nullifier, assetId } and returns it.
 *
 * If decryption fails (e.g. authentication tag mismatch), this throws an error.
 *
 * @param {Object} phantom        window.solana (Phantom) – must be connected
 * @param {string} envelopeJson   The JSON string: 
 *                                {"ephemeralPub":"…","nonce12":"…","cipherText":"…","authTag":"…"}
 * @returns {Promise<{value: string, nullifier: string, assetId: string}>}
 */
export async function decryptEncryptedSuffix(phantom, envelopeJson) {
  if (!phantom || !phantom.isPhantom) {
    throw new Error("Phantom not found. Please install and connect Phantom.");
  }

  // A) Parse the JSON envelope
  let envelope;
  try {
    envelope = JSON.parse(envelopeJson);
  } catch (err) {
    console.error(err);
    throw new Error("Invalid JSON envelope");
  }
  const { ephemeralPub, nonce12, cipherText, authTag } = envelope;
  if (!(ephemeralPub && nonce12 && cipherText && authTag)) {
    throw new Error("Envelope missing one of the required fields");
  }

  // B) Derive the recipient’s Curve25519 private key via Phantom.signMessage("derive‐curve‐priv")
  const msgBytes = new TextEncoder().encode("derive‐curve‐priv");
  const { signature: sig64 } = await phantom.signMessage(msgBytes, "utf8");
  if (!sig64 || sig64.length !== 64) {
    throw new Error("Unexpected signature length from Phantom");
  }
  // HKDF‐SHA256(sig64) → 32 bytes, then RFC‐7748 clamp
  const salt = new Uint8Array(0);
  const info = new TextEncoder().encode("ed2curve-derivation");
  const raw32 = new Uint8Array(32);
  await hkdf(sha256, salt, sig64, info, raw32);
  raw32[0]  &= 248;
  raw32[31] &= 127;
  raw32[31] |= 64;
  const curvePriv = raw32; // X25519 private scalar

  // C) Base64‐decode each field into Uint8Array
  const ephPub_u8   = Uint8Array.from(Buffer.from(ephemeralPub, "base64")); // 32 bytes
  const nonce12_u8  = Uint8Array.from(Buffer.from(nonce12,   "base64")); // 12 bytes
  const cipher_u8   = Uint8Array.from(Buffer.from(cipherText,"base64")); // ciphertext length
  const tag_u8      = Uint8Array.from(Buffer.from(authTag,   "base64")); // 16 bytes

  if (ephPub_u8.length !== 32) {
    throw new Error("Invalid ephemeralPub length");
  }
  if (nonce12_u8.length !== 12) {
    throw new Error("Invalid nonce12 length");
  }
  if (tag_u8.length !== 16) {
    throw new Error("Invalid authTag length");
  }

  // D) Compute shared = X25519(curvePriv, ephPub_u8)
  const shared32 = nacl.scalarMult(curvePriv, ephPub_u8); // 32 bytes

  // E) HKDF(shared32) → 32-byte ChaCha key
  const hkSalt = new Uint8Array(0);
  const hkInfo = new TextEncoder().encode("chacha-message");
  const chachaKey = new Uint8Array(32);
  await hkdf(sha256, hkSalt, shared32, hkInfo, chachaKey);

  // F) ChaCha20‐Poly1305 open
  const chacha = new ChaCha20Poly1305(chachaKey);
  // Reassemble sealed = cipher_u8 || tag_u8
  const sealed = new Uint8Array(cipher_u8.length + tag_u8.length);
  sealed.set(cipher_u8, 0);
  sealed.set(tag_u8, cipher_u8.length);
  const plainBytes = chacha.open(nonce12_u8, sealed, new Uint8Array(0));
  if (!plainBytes) {
    throw new Error("Decryption failed or authenticator mismatch");
  }

  // G) Decode UTF-8 JSON and return the object
  const jsonStr = new TextDecoder().decode(plainBytes);
  let payload;
  try {
    payload = JSON.parse(jsonStr);
  } catch (err) {
    console.error(err);
    throw new Error("Decrypted data is not valid JSON");
  }
  const { value, nullifier, assetId } = payload;
  if (
    typeof value !== "string" ||
    typeof nullifier !== "string" ||
    typeof assetId !== "string"
  ) {
    throw new Error("Decrypted payload missing required fields");
  }

  return { value, nullifier, assetId };
}
