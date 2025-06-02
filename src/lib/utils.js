import { Connection, PublicKey, TransactionInstruction, getSignaturesForAddress } from "@solana/web3.js";
import { CONNECTION, DEVNET_RPC_URL, BATCH_LENGTH, BATCHES_PER_SMALL_TREE, SUB_BATCH_SIZE, MEMO_PROGRAM_ID } from "./constants";
import {toBigInt} from "ethers";
import {poseidon2} from "poseidon-lite";
const { buildBn128, utils } = require("ffjavascript");
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

export function getMerkleProof(tree, leafIndex) {
  const proof = [];
  let index = leafIndex;

  console.log("Merkle proof process started");

  for (let level = 0; level < tree.length - 1; level++) {
    const isRightNode = index % 2 === 1; // Check if index is odd (right node)
    const siblingIndex = isRightNode ? index - 1 : index + 1;

    if (siblingIndex < tree[level].length) {
      proof.push(tree[level][siblingIndex]);
    } else {
      console.warn(`Sibling index ${siblingIndex} out of bounds at level ${level}`);
    }

    // Move up in the tree
    index = Math.floor(index / 2);
  }

  return proof;
}

export function padWithDefaultLeaves(leaves){
  const n = nextPowerOfTwo(leaves.length);
  console.log("Padding to ",n," leaves...");
  let i = leaves.length;
  while(i<n){
    leaves.push(BigInt(0));
    i++;
  }
  console.log("Padded leaves length:", leaves.length);
  return leaves;
}

function getDefaultRootDepth(depth) {
  let parentHash = BigInt(0); // Assuming DEFAULT_LEAF is defined as a constant

  for (let i = 0; i < depth; i++) {
      parentHash = poseidon2([parentHash, parentHash]);
      // console.log(`Depth ${i + 1} hash: ${parentHash.toString()}`);
  }

  return parentHash;
}

export function nextPowerOfTwo(n) {
  let T = 1;
  while (T < n) T *= 2;
  return T;
}

export function isPowerOfTwo(n) {
return n > 0 && (n & (n - 1)) === 0;
}

export function buildMerkleTree(leaves) {
  // Start the tree with the leaves as the 0th level
  const tree = [];
  tree[0] = leaves.slice(); // Copy leaves to avoid mutating original

  let level = 0;
  // Keep combining until we reach a single element (the root)
  while (tree[level].length > 1) {
    const currentLevel = tree[level];
    const nextLevel = [];

    // Since leaves.length is always a power of two, i+1 will never go out of bounds
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = currentLevel[i + 1];
      const merged = poseidon2([left, right]);
      nextLevel.push(merged);
      
    }

    tree.push(nextLevel);
    level++;
  }
  let size = tree.length;
  const rootHash = tree[size-1][0]
  console.log("Root hash from generated tree: ", rootHash);
  console.log("Root hash as byte array", bigIntToU8Array(rootHash))

  return tree;
}

export function bigIntToU8Array(bigInt, byteLength = 32) {
  let hex = bigInt.toString(16); // Convert to hex
  if (hex.length % 2 !== 0) hex = "0" + hex; // Ensure even-length hex
  let bytes = Buffer.from(hex, "hex"); // Convert hex to buffer

  // Ensure the byte array is `byteLength` long (default 32 bytes)
  if (bytes.length < byteLength) {
    const paddedBytes = Buffer.alloc(byteLength); // Create zero-filled buffer
    bytes.copy(paddedBytes, byteLength - bytes.length); // Right-align bytes
    bytes = paddedBytes;
  }

  return Array.from(bytes); // Convert Buffer to an array of numbers (u8)
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

export function parseMerkleMountainRange(data, targetDepthLarge) {
  // skip 8-byte Anchor discriminator
  const dataArr = Buffer.from(data);
  const dv = new DataView(
    dataArr.buffer,
    dataArr.byteOffset,
    dataArr.byteLength
  );
  let offset = 8;

  // 1) merkle_root_batch: 32 bytes
  const merkleRootBatch = dataArr.slice(offset, offset + 32); //8
  offset += 32;

  // 2) batch_leaves: 16 × 32 bytes
  const batchLeaves = [];
  for (let i = 0; i < 16; i++) {
    batchLeaves.push(dataArr.slice(offset, offset + 32)); //40
    offset += 32;
  }

  // 3) identifier: 16 bytes
  const identifier = dataArr.slice(offset, offset + 16);//552
  offset += 16;

  // 4) min_deposit_amount: u64 LE
  const minDepositAmount = dv.getBigUint64(offset, true); //568
  offset += 8;

  // 5) whole_tree_root: 32 bytes
  const wholeTreeRoot = dataArr.slice(offset, offset + 32); //576
  offset += 32;

  // 6) last_small_tree_root: 32 bytes
  const lastSmallTreeRoot = dataArr.slice(offset, offset + 32); //608
  offset += 32;

  // 7) batch_number: u64 LE
  const batchNumber = Number(dv.getBigUint64(offset, true));//640
  const batchNumberBuffer = dataArr.slice(640,648);
  offset += 8;

  // 8) peaks: targetDepthLarge × 32 bytes
  const peaks = [];
  for (let i = 0; i < targetDepthLarge; i++) {
    peaks.push(dataArr.slice(offset, offset + 32));
    offset += 32;
  }

  // 9) depth: targetDepthLarge × u8
  const depth = [];
  for (let i = 0; i < targetDepthLarge; i++) {
    depth.push(dataArr[offset]);
    offset += 1;
  }

  // 10) number_of_peaks: u8
  const numberOfPeaks = dataArr[offset];
  offset += 1;

  // 11) max_leaves: u64 LE
  const maxLeaves = dv.getBigUint64(offset);
  offset += 8;

  // 12) creator: Pubkey (32 bytes)
  const creator = new PublicKey(dataArr.slice(offset, offset + 32));
  offset += 32;

  // 13) creator_fee: u64 LE
  const creatorFee = dv.getBigUint64(offset);
  offset += 8;

  return {
    merkleRootBatch,
    batchLeaves,
    identifier,
    minDepositAmount,
    wholeTreeRoot,
    lastSmallTreeRoot,
    batchNumber,
    peaks,
    depth,
    numberOfPeaks,
    maxLeaves,
    creator,
    creatorFee,
    batchNumberBuffer,
  };
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

export async function attachMemoIfNeeded(poolInfo, leavesToAdd, instrs) {
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
  const merkleMountainRange = parseMerkleMountainRange(data, 28);
  console.log("batchNumber: ", merkleMountainRange.batchNumber);

  // 1) batch_number LE at 608..616 → convert to BE
  // const batchNumLE = data.slice(640, 648);
  // const batchNumBE = Buffer.alloc(8);
  // for (let i = 0; i < 8; i++) {
  //   batchNumBE[i] = batchNumLE[7 - i];
  // }
  // console.log("batchNumberBE:", batchNumBE);
  const batchNumBE = merkleMountainRange.batchNumberBuffer.reverse();

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


//This function needs to call and create a whole other logic when there are more that 4096 batches to parse.

export async function getVariableBatchesFromMemos(connection, leavesIndexer) {
  // 1) Gather all signature infos
  
  let allSigInfos = [];
  let before = null;
  const limit = 1000;
  while (true) {
    const opts = { limit };
    if (before) opts.before = before;
    
    const sigs = await connection.getSignaturesForAddress(leavesIndexer, opts);
    console.log("Signatures: ", sigs);
    if (sigs.length === 0) break;
    allSigInfos.push(...sigs);
    before = sigs[sigs.length - 1].signature;
    if (sigs.length < limit) break;
  }

  // 2) For each memo, decode and bucket by batchId
  const subBatches = new Map(); // batchIdStr -> { count, leaves[], txSignature }
  for (const info of allSigInfos) {
    if (!info.memo) continue;
    // strip off the first 4 chars ("Memo") if you did in your fixed parser:
    const b64 = info.memo.slice(4);
    const memoBytes = Buffer.from(b64, "base64");
    // must be exactly 8 + 8*32 = 264 bytes
    if (memoBytes.length !== 8 + 8 * 32){
      console.log("This is probably a subtree:");
      console.log("memoBytes of this: ", memoBytes);
    }

    // first 8 bytes = big-endian batchId
    const batchId = toBigInt(memoBytes.slice(0, 8));
    if (batchId > 4096) {
      console.log("We need to use the subtreeIndexer in this case");
      //Integrate the subTree parsing
    }
    const key = batchId.toString();
    let entry = subBatches.get(key);
    if (!entry) {
      entry = {
        count: 0,
        leaves: Array(16).fill(0n),
        txSignature: info.signature,
      };
      subBatches.set(key, entry);
    }

    // the next 8*32 bytes are this sub-batch of leaves
    const leavesData = memoBytes.slice(8);
    if (entry.count === 1) {
      // first 8 leaves → positions 0..7
      for (let j = 0; j < 8; j++) {
        const chunk = leavesData.slice(j * 32, (j + 1) * 32);
        entry.leaves[j] = toBigInt(chunk);
      }
    } else if (entry.count === 0) {
      // second 8 leaves → positions 8..15
      for (let j = 0; j < 8; j++) {
        const chunk = leavesData.slice(j * 32, (j + 1) * 32);
        entry.leaves[8 + j] = toBigInt(chunk);
      }
      // once we have both halves, emit a full batch
    } else {
      // ignore any extra memos
      continue;
    }

    entry.count++;
  }

  // 3) Turn completed entries into your final array
  const batches = [];
  for (const [key, entry] of subBatches.entries()) {
    if (entry.count >= 2) {
      batches.push({
        batchId: BigInt(key),
        leaves: entry.leaves,
        txSignature: entry.txSignature,
      });
      console.log("Building a merkle tree from that leaves set, size: ", entry.leaves.length);
      for (let j =0; j<entry.leaves.length; j++){
        console.log(`Leaf ${j} : ${entry.leaves[j]}`);
      }
      buildMerkleTree(entry.leaves);
      
    }
  }
  // 4) Sort by batchId ascending
  console.log("Number of batches: ", batches.length);
  batches.sort((a, b) => (a.batchId < b.batchId ? -1 : a.batchId > b.batchId ? 1 : 0));
  console.log("Batches sorted, proceeding to next step");
  return batches;
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