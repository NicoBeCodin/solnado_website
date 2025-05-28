import { Connection, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { CONNECTION, DEVNET_RPC_URL, BATCH_LENGTH, BATCHES_PER_SMALL_TREE, SUB_BATCH_SIZE, MEMO_PROGRAM_ID } from "./constants";

/**
 * Fetches the SOL balance (in SOL) for a given base58 pubkey string.
 */
export async function getBalance(pubkeyStr) {
  const connection = new Connection(DEVNET_RPC_URL, "processed");
  const lamports = await connection.getBalance(new PublicKey(pubkeyStr));
  return lamports / 1e9;
}
export function pubkeyToBigInt(base58) {
  return BigInt("0x" + new PublicKey(base58).toBuffer().toString("hex"));
}
export function to8BE(x) {
  const buf = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    // mask off the low byte
    buf[i] = Number(x & 0xFFn);
    x >>= 8n;
  }
  return buf;
}

export async function sendTransactionWithLogs(
  connection,
  wallet,
  transaction
) {
  try {
    if (!wallet.signTransaction) {
      throw new Error("Wallet does not support signing transactions.");
    }

    // Sign the transaction with the wallet
    const signedTransaction = await wallet.signTransaction(transaction);

    // Send the signed transaction
    const signature = await connection.sendRawTransaction(
      signedTransaction.serialize(),
      {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      }
    );

    await connection.confirmTransaction(signature, "confirmed");
    console.log("Transaction confirmed with signature:", signature);
    return signature;
  } catch (err) {
    console.error("Error during transaction:", err);

    throw err;
  }
}

// little helper: BigInt → 32-byte BE Buffer
export function to32(x) {
  const hex = x.toString(16).padStart(64, "0");
  return Buffer.from(hex, "hex");
}



/**
 * If batchNumber ≠ 0 and divisible by 4096, append a Memo with the 32-byte
 * big-endian small-tree root.
 *
 * @param batchNumber  on-chain u64 batch_number
 * @param tx           the Transaction you’re building
 * @param wholeTreeRoot  BigInt or hex-string or Buffer of the 32-byte root
 */
export async function maybeAddSmallTreeMemo(
  batchNumber,
  rootBuf,
  instrs
) {
  if (batchNumber !== 0n && batchNumber % BATCHES_PER_SMALL_TREE === 0n) {
    if (rootBuf.length !== 32) {
      throw new Error("small-tree root must be exactly 32 bytes");
    }

    // Base64-encode the raw 32-byte root, then UTF-8 encode
    //
    const memoText = rootBuf.toString("base64");
    const memoIx = new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [],
      data: Buffer.from(memoText, "utf8"),
    });

    instrs.push(memoIx);
    return true
  }
  return false;

}

export async function findFreeSlotIndex(poolInfo) {
  // const acct = await connection.getAccountInfo(poolPDA);
  // if (!acct) throw new Error("Pool account not found");
  // const data = Buffer.from(acct.data);
  const data = poolInfo

  // In your state layout the 16×32 bytes of `leaves` live at offset 40
  const leavesBuf = data.slice(40, 40 + BATCH_LENGTH * 32);
  for (let i = 0; i < BATCH_LENGTH; i++) {
    const chunk = leavesBuf.slice(i * 32, (i + 1) * 32);
    if (chunk.every((b) => b === 0)) {
      console.log("First free spot at index ", i);
      return i;
    }
  }
  return -1;
}



export async function attachMemoIfNeeded(tx, poolInfo, leavesToAdd, instrs) {
  // 1) Find first free slot
  const freeIdx = await findFreeSlotIndex(poolInfo);
  if (freeIdx < 0) return;            // fully full—error handled later
  const n = leavesToAdd.length;
  console.log("freeIdx: ", freeIdx);

  // 2) If crossing the first 8-leaf boundary:
  if (freeIdx < SUB_BATCH_SIZE && freeIdx + n >= SUB_BATCH_SIZE) {

    await postSubBatchMemo(poolInfo, 0, SUB_BATCH_SIZE, leavesToAdd, freeIdx, instrs);
    
    return true;
  }
  // 3) If crossing the second (16-leaf) boundary:
  else if (freeIdx < BATCH_LENGTH && freeIdx + n >= BATCH_LENGTH) {
    await postSubBatchMemo(poolInfo, SUB_BATCH_SIZE, BATCH_LENGTH, leavesToAdd, freeIdx, instrs);
    return true;
  }
  return false;
  // otherwise: stays within one sub-batch, no memo needed
}

export async function postSubBatchMemo(poolInfo, startIdx, endIdx, leavesToAdd, freeIdx, instrs) {
  // const acct = await connection.getAccountInfo(poolPDA);
  // if (!acct) throw new Error("Pool account not found");
  const data = poolInfo

  // 1) batch_number LE at 608..616 → convert to BE
  const batchNumLE = data.slice(608, 616);
  const batchNumBE = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) {
    batchNumBE[i] = batchNumLE[7 - i];
  }

  // 2) grab all 16 existing leaves at offset 40..40+16*32
  const leavesBuf = data.slice(40, 40 + BATCH_LENGTH * 32);
  const existing = [];
  for (let i = 0; i < BATCH_LENGTH; i++) {
    existing.push(leavesBuf.slice(i * 32, (i + 1) * 32));
  }

  // 3) build the exactly (endIdx-startIdx) leaves for this memo:
  const memoLeaves = [];
  for (let i = startIdx; i < endIdx; i++) {
    // if this slot is one of the newly added
    if (i >= freeIdx && i < freeIdx + leavesToAdd.length) {
      memoLeaves.push(to32(leavesToAdd[i - freeIdx]));
    } else {
      memoLeaves.push(existing[i]);
    }
  }

  // 4) concat batchNumBE + those leaves, base64
  const memoSlice = Buffer.concat([batchNumBE, ...memoLeaves]);
  const memoText = memoSlice.toString("base64");

  // 5) prepend the Memo instruction
  const memoIx = new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(memoText, "utf8"),
  });
  instrs.push(memoIx);
  
}



export function g1Uncompressed(curve, p1Raw) {
  let p1 = curve.G1.fromObject(p1Raw);

  let buff = new Uint8Array(64); // 64 bytes for G1 uncompressed
  curve.G1.toRprUncompressed(buff, 0, p1);

  return Buffer.from(buff);
}

export function g2Uncompressed(curve, p2Raw) {
  let p2 = curve.G2.fromObject(p2Raw);

  let buff = new Uint8Array(128); // 128 bytes for G2 uncompressed
  curve.G2.toRprUncompressed(buff, 0, p2);

  return Buffer.from(buff);
}