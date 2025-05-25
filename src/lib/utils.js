import { Connection, PublicKey } from "@solana/web3.js";
import { DEVNET_RPC_URL } from "./constants";

/**
 * Fetches the SOL balance (in SOL) for a given base58 pubkey string.
 */
export async function getBalance(pubkeyStr) {
  const connection = new Connection(DEVNET_RPC_URL, "processed");
  const lamports = await connection.getBalance(new PublicKey(pubkeyStr));
  return lamports / 1e9;
}
