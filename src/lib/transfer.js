import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import { groth16 } from "snarkjs";
import { poseidon1, poseidon2, poseidon3 } from "poseidon-lite";
// import { buildPoseidon } from "circomlibjs";
// or your poseidon import
import { sendTransactionWithLogs, pubkeyToBigInt, to32, g1Uncompressed, g2Uncompressed, attachMemoIfNeeded, maybeAddSmallTreeMemo, to8BE, getVariableBatchesFromMemos, padWithDefaultLeaves, buildMerkleTree, getMerkleProof, bigIntToU8Array, parseMerkleMountainRange} from "./utils.js";
import {
  PROGRAM_ID,
  VARIABLE_POOL_SEED,
  instructionDiscriminators,
  LEAVES_INDEXER_SEED,
  SUBTREE_INDEXER_SEED,
  TARGET_DEPTH,
  TREE_DEPTH_LARGE_ARRAY
} from "./constants.js";
const { buildBn128, utils } = require("ffjavascript");


export async function transfer(
  connection,
  walletAdapter,
  identifier
) {
  if (!walletAdapter.publicKey) throw new Error("Wallet not connected");

  // 1) Choose mode
  // 1) Choose mode
  const mode = Number(prompt(
    `Combine mode?\n` +
    `0 = 2 old‐leaves → 1 new‐leaf\n` +
    `1 = 1 old‐leaf → 2 new‐leaves\n` +
    `2 = 2 old‐leaves → 2 new‐leaves`
  ));
  if (![0, 1, 2].includes(mode)) throw new Error("Invalid mode");

  // 2) assetId = native SOL
  const assetId = 0n;

  // 3) Prompt old‐leaf values & nullifiers
  let vals, nulls;
  if (mode === 1) {
    // one old‐leaf
    const v0 = BigInt(prompt("Old leaf value (lamports):") || "0");
    vals = [v0];
    nulls = [prompt("Old nullifier:") || ""];
  } else {
    // two old‐leaves
    const v1 = BigInt(prompt("Old leaf #1 value:") || "0");
    const v2 = BigInt(prompt("Old leaf #2 value:") || "0");
    vals = [v1, v2];
    nulls = [
      prompt("Old nullifier #1:") || "",
      prompt("Old nullifier #2:") || "",
    ];
  }

  // 4) Prompt Merkle keys & siblings for each old leaf
  //    (you’ll want a nicer UI than a comma‐string prompt)
  let key1, siblings1, key2, siblings2;
  if (mode === 1) {
    key1 = Number(prompt("Old leaf index (u32):") || "0");
    siblings1 = (prompt("Comma‐sep hex siblings:") || "")
      .split(",").map(h => BigInt("0x" + h));
  } else {
    key1 = Number(prompt("Old #1 index:") || "0");
    siblings1 = (prompt("Old #1 siblings:") || "")
      .split(",").map(h => BigInt("0x" + h));
    key2 = Number(prompt("Old #2 index:") || "0");
    siblings2 = (prompt("Old #2 siblings:") || "")
      .split(",").map(h => BigInt("0x" + h));
  }

  // 5) Prompt new‐leaf values & nullifiers
  let newVals, newNulls;
  if (mode === 0) {
    // 2→1
    const nv = vals[0] + vals[1];
    const nn = BigInt(prompt("New nullifier:") || "0");
    newVals = [nv];
    newNulls = [nn];
  } else if (mode === 1) {
    // 1→2
    const nv1 = BigInt(prompt("New leaf #1 value:") || "0");
    const nn1 = BigInt(prompt("New nullifier #1:") || "0");
    const nv2 = BigInt(prompt("New leaf #2 value:") || "0");
    const nn2 = BigInt(prompt("New nullifier #2:") || "0");
    newVals = [nv1, nv2];
    newNulls = [nn1, nn2];
  } else {
    // 2→2
    const nv1 = BigInt(prompt("New leaf #1 value:") || "0");
    const nn1 = BigInt(prompt("New nullifier #1:") || "0");
    const nv2 = BigInt(prompt("New leaf #2 value:") || "0");
    const nn2 = BigInt(prompt("New nullifier #2:") || "0");
    newVals = [nv1, nv2];
    newNulls = [nn1, nn2];
  }

  // 6) Compute on‐chain leaf commitments
  const oldLeaf1 = poseidon3([vals[0], BigInt("0x" + Buffer.from(nulls[0], "utf8").toString("hex")), assetId]);
  const oldLeaf2 = (mode === 1)
    ? 0n
    : poseidon3([vals[1], BigInt("0x" + Buffer.from(nulls[1], "utf8").toString("hex")), assetId]);
  const newLeaf1 = poseidon3([newVals[0], newNulls[0], assetId]);
  const newLeaf2 = (newVals.length === 2)
    ? poseidon3([newVals[1], newNulls[1], assetId])
    : 0n;

  // 7) Derive pool PDA & fetch account for root
  const idBuf = Buffer.alloc(16);
  idBuf.write(identifier, 0, "utf8");
  const [poolPDA] = PublicKey.findProgramAddressSync(
    [VARIABLE_POOL_SEED, idBuf],
    PROGRAM_ID
  );
  const acct = await connection.getAccountInfo(poolPDA);
  if (!acct) throw new Error("Pool not found");
  // assume the Merkle root lives at bytes 576..608
  const rootBuf = acct.data.slice(576, 608);
  const root = BigInt("0x" + Buffer.from(rootBuf).toString("hex"));

  // 8) Build snarkjs input + pick your circuit
  let inp, wasm, zkey;
  if (mode === 0) {
    // Combine2to1(nLevels)
    inp = {
      key1,
      val1: vals[0].toString(),
      null1: BigInt("0x" + Buffer.from(nulls[0], "utf8").toString("hex")).toString(),
      asset1: assetId.toString(),
      leaf1: oldLeaf1.toString(),
      siblings1: siblings1.map(x => x.toString()),

      key2,
      val2: vals[1].toString(),
      null2: BigInt("0x" + Buffer.from(nulls[1], "utf8").toString("hex")).toString(),
      asset2: assetId.toString(),
      leaf2: oldLeaf2.toString(),
      siblings2: siblings2.map(x => x.toString()),

      newNull: newNulls[0].toString(),
      newLeaf: newLeaf1.toString(),
      root: root.toString(),
    };
    wasm = "/circuits/Combine2to1/Combine2to1.wasm";
    zkey = "/circuits/Combine2to1/Combine2to1.zkey";

  } else if (mode === 1) {
    // Combine1to2(nLevels)
    inp = {
      key: key1,
      val0: vals[0].toString(),
      null0: BigInt("0x" + Buffer.from(nulls[0], "utf8").toString("hex")).toString(),
      asset0: assetId.toString(),
      leaf0: oldLeaf1.toString(),
      siblings0: siblings1.map(x => x.toString()),

      val1: newVals[0].toString(),
      null1: newNulls[0].toString(),
      val2: newVals[1].toString(),
      null2: newNulls[1].toString(),

      newLeaf1: newLeaf1.toString(),
      newLeaf2: newLeaf2.toString(),
      root: root.toString(),
    };
    wasm = "/circuits/Combine1to2/Combine1to2.wasm";
    zkey = "/circuits/Combine1to2/Combine1to2.zkey";

  } else {
    // Combine2to2(nLevels)
    inp = {
      key1, val1: vals[0].toString(),
      null1: BigInt("0x" + Buffer.from(nulls[0], "utf8").toString("hex")).toString(),
      asset1: assetId.toString(),
      leaf1: oldLeaf1.toString(),
      siblings1: siblings1.map(x => x.toString()),

      key2, val2: vals[1].toString(),
      null2: BigInt("0x" + Buffer.from(nulls[1], "utf8").toString("hex")).toString(),
      asset2: assetId.toString(),
      leaf2: oldLeaf2.toString(),
      siblings2: siblings2.map(x => x.toString()),

      newVal1: newVals[0].toString(),
      newNull1: newNulls[0].toString(),
      newVal2: newVals[1].toString(),
      newNull2: newNulls[1].toString(),

      newLeaf1: newLeaf1.toString(),
      newLeaf2: newLeaf2.toString(),
      root: root.toString(),
    };
    wasm = "/circuits/Combine2to2/Combine2to2.wasm";
    zkey = "/circuits/Combine2to2/Combine2to2.zkey";
  }

  // 9) Generate proof
  const { proof, publicSignals } = await groth16.fullProve(inp, wasm, zkey);

  // 10) Pack public inputs the same order Rust expects
  //     e.g. for mode=0: [null1, null2, newLeaf, root]
  const sigs = publicSignals.map(s => BigInt(s));
  let pubBuf;
  switch (mode) {
    case 0:
      pubBuf = Buffer.concat([
        to32(sigs[0]),  // null1
        to32(sigs[1]),  // null2
        to32(sigs[2]),  // newLeaf
        to32(sigs[3]),  // root
      ]);
      break;
    case 1:
      pubBuf = Buffer.concat([
        to32(sigs[0]),  // null1
        to32(sigs[1]),  // newLeaf1
        to32(sigs[2]),  // newLeaf2
        to32(sigs[3]),  // root
      ]);
      break;
    case 2:
      pubBuf = Buffer.concat([
        to32(sigs[0]),  // null1
        to32(sigs[1]),  // null2
        to32(sigs[2]),  // newLeaf1
        to32(sigs[3]),  // newLeaf2
        to32(sigs[4]),  // root
      ]);
      break;
  }

  // 6) Serialize proof πA/πB/πC
  const proofBI = unstringifyBigInts(proof);
  const curve = await buildBn128();
  const pi_a = g1Uncompressed(curve, proofBI.pi_a);
  const pi_b = g2Uncompressed(curve, proofBI.pi_b);
  const pi_c = g1Uncompressed(curve, proofBI.pi_c);


  // 7) Build instruction data:
  const disc = new Uint8Array(instructionDiscriminators.combine_deposit);
  const disc_mode = disc.push(0);
  const ixData = Buffer.concat([disc_mode, pi_a, pi_b, pi_c, pubBuf]);

  // 8) Build the instruction keys
  const keys = [
    { pubkey: poolPDA, isSigner: false, isWritable: true }, // pool
    { pubkey: walletAdapter.publicKey, isSigner: true, isWritable: true }, // user
    { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  // add nullifier PDAs
  nulls.forEach((n, i) => {
    const [nd] = PublicKey.findProgramAddressSync([Buffer.from(n)], PROGRAM_ID);
    keys.push({ pubkey: nd, isSigner: false, isWritable: true });
  });

  const tx = new Transaction();
  const instrs = [];
  if (await attachMemoIfNeeded(dataArr, leaves, instrs)) {
    const [leavesIndexer] = PublicKey.findProgramAddressSync(
      [LEAVES_INDEXER_SEED, idBuf],
      PROGRAM_ID
    );
    keys.push({
      pubkey: leavesIndexer,
      isSigner: false,
      isWritable: false,
    });
    console.log("Added leaves_indexer to combineIx");
  }

  if (await maybeAddSmallTreeMemo(batchNum, subtreeRoot, instrs)) {
    console.log("Adding small tree memoIx");
    const [subtreeIndexer] = PublicKey.findProgramAddressSync(
      [SUBTREE_INDEXER_SEED, idBuf],
      PROGRAM_ID
    );
    const [leavesIndexer] = PublicKey.findProgramAddressSync(
      [LEAVES_INDEXER_SEED, idBuf],
      PROGRAM_ID
    );
    keys.push({
      pubkey: leavesIndexer,
      isSigner: false,
      isWritable: false,
    });
    keys.push({
      pubkey: subtreeIndexer,
      isSigner: false,
      isWritable: false,
    });
  }
  if (keys.length < 6) {
    console.log("Adding dummy account for anchor constraint");
    keys.push({ pubkey: SYSVAR_RECENT_BLOCKHASHES_PUBKEY, isSigner: false, isWritable: false });
  }

  const combineIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: keys,
    data: ixData
  }
  )
  instrs.push(combineIx);
  instrs.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }));
  tx.instructions = instrs;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = walletAdapter.publicKey;

  return await sendTransactionWithLogs(connection, walletAdapter, tx)
}

export async function chooseTransfer(
  connection,
  walletAdapter,
  identifier
) {
  if (!walletAdapter.publicKey) throw new Error("Wallet not connected");
  if (!identifier) {
    identifier = prompt("Enter pool identifier (max 16 chars):") || "";
  }
  // 1) Choose mode
  // 1) Choose mode
  const mode = Number(prompt(
    `Combine mode?\n` +
    `0 = 2 old‐leaves → 1 new‐leaf\n` +
    `1 = 1 old‐leaf → 2 new‐leaves\n` +
    `2 = 2 old‐leaves → 2 new‐leaves`
  ));
  if (![0, 1, 2].includes(mode)) throw new Error("Invalid mode");
  switch (mode) {
    case 0:
      return await transferCombine2to1(connection, walletAdapter, identifier);
    case 1: 
      return await transferCombine1to2(connection, walletAdapter, identifier);
    default:
      console.log("Damn");
  }
}
export async function transferCombine2to1(
  connection,
  walletAdapter,
  identifier
) {
  if (!walletAdapter.publicKey) throw new Error("Wallet not connected");

  // — 1) Prompt the two old‐leaves —
  // const v1 = BigInt(prompt("Old leaf #1 value (lamports):") || "0");
  // const n1 = prompt("Old nullifier #1 (utf8):") || "";
  // const v2 = BigInt(prompt("Old leaf #2 value (lamports):") || "0");
  // const n2 = prompt("Old nullifier #2 (utf8):") || "";

  const v1 = BigInt(1000000);
  const n1 = "nul21";
  const v2 = BigInt(1000000);
  const n2 = "nul31";

  // — 3) Prompt the new‐leaf nullifier and compute its commitment —
  // const newNullifier = prompt("enter new nullifier");
  const newNullifier = "nul2400000";
  const newNull = BigInt("0x" + Buffer.from(newNullifier, "utf8").toString("hex"));
  const assetId = 0n; // native SOL
  const newVal = v1 + v2;
  const newLeaf = poseidon3([newVal, newNull, assetId]);
  let oldNull1 = BigInt("0x" + Buffer.from(n1, "utf8").toString("hex"));
  let oldNull2 = BigInt("0x" + Buffer.from(n2, "utf8").toString("hex"))
  // — 4) Recompute old‐leaf commitments on the client —
  const oldLeaf1 = poseidon3([
    v1,
    oldNull1,
    assetId
  ]);
  const oldLeaf2 = poseidon3([
    v2,
    oldNull2,
    assetId
  ]);
  console.log("Test  ", identifier)
  const oldNullHash1 = poseidon1([oldNull1]);
  const oldNullHash2 = poseidon1([oldNull2]);
  // — 5) Fetch on‐chain root from pool account —
  console.log("Test2");
  const idBuf = Buffer.alloc(16);
  idBuf.write(identifier, 0, "utf8");
  const [poolPDA] = PublicKey.findProgramAddressSync(
    [VARIABLE_POOL_SEED, idBuf],
    PROGRAM_ID
  );
  const [leavesIndexerPDA] = PublicKey.findProgramAddressSync(
    [LEAVES_INDEXER_SEED, idBuf],
    PROGRAM_ID
  );
  const acct = await connection.getAccountInfo(poolPDA);
  if (!acct) throw new Error("Pool not found");
  // assume your Merkle root is stored at byte offset 576..608
  
  
  const dataArr = Buffer.from(acct.data);
  const merkleMountainRange = parseMerkleMountainRange(dataArr, 28);
  
  const lastSmallTreeRoot = merkleMountainRange.lastSmallTreeRoot;
  const batchNum = merkleMountainRange.batchNumber;
  const root = BigInt("0x" + Buffer.from(merkleMountainRange.wholeTreeRoot).toString("hex"));

  const batches = await getVariableBatchesFromMemos(connection, leavesIndexerPDA);
  const flatLeaves = batches.flatMap(b => b.leaves);
  console.log("Number of leaves: ", flatLeaves.length);
  
  const defaultHash = [0n];
  for (let d = 1; d <= TARGET_DEPTH; d++) {
    defaultHash[d] = poseidon2([defaultHash[d - 1], defaultHash[d - 1]]);
    // console.log(`level: ${d}, hash: ${bigIntToU8Array(defaultHash[d])}`);
  }

  const padded = padWithDefaultLeaves(flatLeaves);

  // build that small subtree, evntually the leaf index will be known by user which will avoid parsing all leaves
  const subtree = buildMerkleTree(padded);
  const subTreeRoot = subtree[subtree.length - 1][0];
  console.log("subTree root : ", subTreeRoot);
  console.log("Onchain subtree root: ", root);
  console.log("oldLeaf1", oldLeaf1);
  const idx1 = padded.findIndex(x => x === oldLeaf1);
  if (idx1 < 0) throw new Error("Leaf1 not in tree");
  const idx2 = padded.findIndex(x => x === oldLeaf2);
  if (idx2 < 0) throw new Error("Leaf2 not in tree");


  // 7️⃣ get the *subtree* proofs (arrays of length subtreeDepth-1):
  const pathSub1 = getMerkleProof(subtree, idx1);
  // console.log("PathSub1: ", pathSub1);
  const pathSub2 = getMerkleProof(subtree, idx2);

  const siblingsNeeded = TARGET_DEPTH - pathSub1.length

  // build array:
  const fullPath1 = pathSub1.concat(
    Array.from({ length: siblingsNeeded }, (_, j) =>
      defaultHash[pathSub1.length + j]   //
    )
  );
  const fullPath2 = pathSub2.concat(
    Array.from({ length: TARGET_DEPTH - pathSub2.length }, (_, j) =>
      defaultHash[pathSub2.length + j]
    )
  );

  // now deepen exactly those same defaults:
  let fullRoot = subTreeRoot;
  for (let j = 0; j < siblingsNeeded; j++) {
    fullRoot = poseidon2([fullRoot, defaultHash[pathSub1.length + j]]);
  }

  const sibs1 = fullPath1.slice().reverse().map(x => x.toString());
  const sibs2 = fullPath2.slice().reverse().map(x => x.toString());



  // — 6) Build the Combine2to1 circuit input —
  const inp = {
    key1: idx1,
    secret1: v1.toString(),
    nullifier1: oldNull1.toString(),
    nullifierHash1: oldNullHash1,
    asset1: assetId.toString(),
    siblings1: sibs1,

    key2:idx2,
    secret2: v2.toString(),
    nullifier2: oldNull2.toString(),
    nullifierHash2: oldNullHash2,
    asset2: assetId.toString(),
    siblings2: sibs2,

    nullifier3: newNull.toString(),
    newLeaf: newLeaf.toString(),
    root: fullRoot.toString(),
  };
  const wasm = "/circuits/Combine2to1/Combine2to1_js/Combine2to1.wasm";
  const zkey = "/circuits/Combine2to1/Combine2to1.zkey";

  // — 7) Generate the SNARK proof —
  const { proof, publicSignals } = await groth16.fullProve(inp, wasm, zkey);
  
  // — 8) Pack the public inputs as [null1, null2, newLeaf, root] —
  const sigs = publicSignals.map(s => BigInt(s));
  const pubBuf = Buffer.concat([
    to32(sigs[0]),  // nullHash1
    to32(sigs[1]),  // nullHash2
    to32(sigs[2]),  // newLeaf
    to32(sigs[3]),  // root
  ]);
  
  // — 9) Serialize proof πA/πB/πC —
  const { unstringifyBigInts} =utils;
  const proofBI = unstringifyBigInts(proof);
  const curve = await buildBn128();
  const pi_a = g1Uncompressed(curve,proofBI.pi_a);
  const pi_b = g2Uncompressed(curve,proofBI.pi_b);
  const pi_c = g1Uncompressed(curve, proofBI.pi_c);

  // — 10) Build your Anchor instruction —
  const disc = new Uint8Array(instructionDiscriminators.combine_deposit);
  
  const base = Buffer.from(disc);
  const disc_mode = Buffer.concat([
    base,
    Buffer.from([0x00])
  ]);
  
   //We push the u8 the program expects
  const ixData = Buffer.concat([disc_mode, pi_a, pi_b, pi_c, pubBuf]);
  
  const [null1PDA] = PublicKey.findProgramAddressSync(
    [Buffer.from(to32(sigs[0]), "utf8")],
    PROGRAM_ID
  );
  const [null2PDA] = PublicKey.findProgramAddressSync(
    [Buffer.from(to32(sigs[1]), "utf8")],
    PROGRAM_ID
  );

  const keys = [
    { pubkey: poolPDA, isSigner: false, isWritable: true }, 
    { pubkey: walletAdapter.publicKey, isSigner: true, isWritable: true }, // user
    { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: null1PDA, isSigner: false, isWritable: true },
    { pubkey: null2PDA, isSigner: false, isWritable: true },  
  ];
  
  const tx = new Transaction();
  const instrs =[];

  if (await attachMemoIfNeeded(dataArr, newLeaf, instrs)) {
    const [leavesIndexer] = PublicKey.findProgramAddressSync(
      [LEAVES_INDEXER_SEED, idBuf],
      PROGRAM_ID
    );
    keys.push({
      pubkey: leavesIndexer,
      isSigner: false,
      isWritable: false,
    });
    console.log("Added leaves_indexer to combineIx")
  }

  if (await maybeAddSmallTreeMemo(Number(batchNum), lastSmallTreeRoot, instrs)) {
    console.log("Adding small tree memoIx");
    const [subtreeIndexer] = PublicKey.findProgramAddressSync(
      [SUBTREE_INDEXER_SEED, idBuf],
      PROGRAM_ID
    );
    const [leavesIndexer] = PublicKey.findProgramAddressSync(
      [LEAVES_INDEXER_SEED, idBuf],
      PROGRAM_ID
    );
    keys.push({
      pubkey: leavesIndexer,
      isSigner: false,
      isWritable: false,
    });
    keys.push({
      pubkey: subtreeIndexer,
      isSigner: false,
      isWritable: false,
    });
  }
  console.log('test 6');
  
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data: ixData,
  });
  instrs.push(ix);
  instrs.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }));
  
  // — 11) Build & send transaction —
  tx.instructions = instrs;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = walletAdapter.publicKey;

  return await sendTransactionWithLogs(connection, walletAdapter, tx);
}

export async function transferCombine1to2(connection, walletAdapter, identifier)
  {
    if (!walletAdapter.publicKey) throw new Error("Wallet not connected");
  
    // — 1) Prompt the two old‐leaves —
    // const v1 = BigInt(prompt("Old leaf #1 value (lamports):") || "0");
    // const n1 = prompt("Old nullifier #1 (utf8):") || "";
  
    const v1 = BigInt(1000000);
    const n1 = "nul41";
  
    // — 3) Prompt the new‐leaf nullifier and compute its commitment —
    const newVal1  = BigInt(prompt("Enter new val1 (second value will be deducted)"));
    const newNullifier1 = prompt("enter new nullifier1");
    const newNullifier2 = prompt("Enter new nullifier2");
    const newVal2 = v1 - newVal1;

    // const newNullifier1 = "nul2400000";
    const newNull1 = BigInt("0x" + Buffer.from(newNullifier1, "utf8").toString("hex"));
    const newNull2 = BigInt("0x" + Buffer.from(newNullifier2, "utf8").toString("hex"));
    const assetId = 0n; // native SOL
    
    const newLeaf1 = poseidon3([newVal1, newNull1, assetId]);
    const newLeaf2 = poseidon3([newVal2, newNull2, assetId]);
    let oldNull = BigInt("0x" + Buffer.from(n1, "utf8").toString("hex"));
    
    // — 4) Recompute old‐leaf commitments on the client —
    const oldLeaf = poseidon3([
      v1,
      oldNull,
      assetId
    ]);
    
    const oldNullHash= poseidon1([oldNull]);
    
    // — 5) Fetch on‐chain root from pool account —
    const idBuf = Buffer.alloc(16);
    idBuf.write(identifier, 0, "utf8");
    const [poolPDA] = PublicKey.findProgramAddressSync(
      [VARIABLE_POOL_SEED, idBuf],
      PROGRAM_ID
    );
    const [leavesIndexerPDA] = PublicKey.findProgramAddressSync(
      [LEAVES_INDEXER_SEED, idBuf],
      PROGRAM_ID
    );
    const acct = await connection.getAccountInfo(poolPDA);
    if (!acct) throw new Error("Pool not found");
    const dataArr = Buffer.from(acct.data);
    const merkleMountainRange = parseMerkleMountainRange(dataArr, TREE_DEPTH_LARGE_ARRAY);
    
    const lastSmallTreeRoot = merkleMountainRange.lastSmallTreeRoot;
    const batchNum = merkleMountainRange.batchNumber;
    const root = BigInt("0x" + Buffer.from(merkleMountainRange.wholeTreeRoot).toString("hex"));
  
    const batches = await getVariableBatchesFromMemos(connection, leavesIndexerPDA);
    const flatLeaves = batches.flatMap(b => b.leaves);
    console.log("Number of leaves: ", flatLeaves.length);
    
    const defaultHash = [0n];
    for (let d = 1; d <= TARGET_DEPTH; d++) {
      defaultHash[d] = poseidon2([defaultHash[d - 1], defaultHash[d - 1]]);
      // console.log(`level: ${d}, hash: ${bigIntToU8Array(defaultHash[d])}`);
    }
  
    const padded = padWithDefaultLeaves(flatLeaves);
  
    // build that small subtree, evntually the leaf index will be known by user which will avoid parsing all leaves
    const subtree = buildMerkleTree(padded);
    const subTreeRoot = subtree[subtree.length - 1][0];
    console.log("subTree root : ", subTreeRoot);
    console.log("Onchain subtree root: ", root);
    
    const idx = padded.findIndex(x => x === oldLeaf);
    if (idx < 0) throw new Error("Leaf not in tree");
  
    // 7️⃣ get the *subtree* proofs (arrays of length subtreeDepth-1):
    const pathSub = getMerkleProof(subtree, idx);
  
    const siblingsNeeded = TARGET_DEPTH - pathSub.length
  
    // build array:
    const fullPath = pathSub.concat(
      Array.from({ length: siblingsNeeded }, (_, j) =>
        defaultHash[pathSub.length + j]   //
      )
    );
    // now deepen exactly those same defaults:
    let fullRoot = subTreeRoot;
    for (let j = 0; j < siblingsNeeded; j++) {
      fullRoot = poseidon2([fullRoot, defaultHash[pathSub.length + j]]);
    }
  
    const sibs = fullPath.slice().reverse().map(x => x.toString());  
  
    // — 6) Build the Combine2to1 circuit input —
    const inp = {
      key: idx,
      val0: v1.toString(),
      null0: oldNull.toString(),
      nullifierHash0: oldNullHash,
      asset0: assetId.toString(),
      leaf0: oldLeaf.toString(),
      siblings: sibs,

      val1: newVal1.toString(),
      null1: newNull1.toString(),
      val2: newVal2.toString(),
      null2: newNull2.toString(),
  
      newLeaf1: newLeaf1.toString(),
      newLeaf2: newLeaf2.toString(),
      root: fullRoot.toString(),
    };
    const wasm = "/circuits/Combine1to2/Combine1to2_js/Combine1to2.wasm";
    const zkey = "/circuits/Combine1to2/Combine1to2.zkey";

    // — 7) Generate the SNARK proof —
    const { proof, publicSignals } = await groth16.fullProve(inp, wasm, zkey);
    
    // — 8) Pack the public inputs as [null1, null2, newLeaf, root] —
    const sigs = publicSignals.map(s => BigInt(s));
    const pubBuf = Buffer.concat([
      to32(sigs[0]),  // nullHash1
      to32(sigs[1]),  // newLeaf1
      to32(sigs[2]),  // newLeaf2
      to32(sigs[3]),  // root
    ]);
    
    // — 9) Serialize proof πA/πB/πC —
    const { unstringifyBigInts} =utils;
    const proofBI = unstringifyBigInts(proof);
    const curve = await buildBn128();
    const pi_a = g1Uncompressed(curve,proofBI.pi_a);
    const pi_b = g2Uncompressed(curve,proofBI.pi_b);
    const pi_c = g1Uncompressed(curve, proofBI.pi_c);
  
    // — 10) Build your Anchor instruction —
    const disc = new Uint8Array(instructionDiscriminators.combine_deposit);
    
    const base = Buffer.from(disc);
    const disc_mode = Buffer.concat([
      base,
      Buffer.from([0x01])
    ]);
    
     //We push the u8 the program expects
    const ixData = Buffer.concat([disc_mode, pi_a, pi_b, pi_c, pubBuf]);
    
    const [null1PDA] = PublicKey.findProgramAddressSync(
      [Buffer.from(to32(sigs[0]), "utf8")],
      PROGRAM_ID
    );
    //this is a dummy pda;
    const [null2PDA] = PublicKey.findProgramAddressSync(
      [Buffer.from(to32(sigs[1]), "utf8")],
      PROGRAM_ID
    );
  
    const keys = [
      { pubkey: poolPDA, isSigner: false, isWritable: true }, 
      { pubkey: walletAdapter.publicKey, isSigner: true, isWritable: true }, // user
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: null1PDA, isSigner: false, isWritable: true },
      { pubkey: null2PDA, isSigner: false, isWritable: true }, 
    ];
    
    const tx = new Transaction();
    const instrs =[];
  
    if (await attachMemoIfNeeded(dataArr, [newLeaf1, newLeaf2], instrs)) {
      const [leavesIndexer] = PublicKey.findProgramAddressSync(
        [LEAVES_INDEXER_SEED, idBuf],
        PROGRAM_ID
      );
      keys.pop();
      keys.push({
        pubkey: leavesIndexer,
        isSigner: false,
        isWritable: false,
      });
      console.log("Added leaves_indexer to combineIx")
    }
  
    if (await maybeAddSmallTreeMemo(batchNum, lastSmallTreeRoot, instrs)) {
      console.log("Adding small tree memoIx");
      keys.pop();
      const [subtreeIndexer] = PublicKey.findProgramAddressSync(
        [SUBTREE_INDEXER_SEED, idBuf],
        PROGRAM_ID
      );
      const [leavesIndexer] = PublicKey.findProgramAddressSync(
        [LEAVES_INDEXER_SEED, idBuf],
        PROGRAM_ID
      );
      keys.push({
        pubkey: leavesIndexer,
        isSigner: false,
        isWritable: false,
      });
      keys.push({
        pubkey: subtreeIndexer,
        isSigner: false,
        isWritable: false,
      });
    }
    console.log('test 6');
    
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys,
      data: ixData,
    });
    instrs.push(ix);
    instrs.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }));
    
    // — 11) Build & send transaction —
    tx.instructions = instrs;
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = walletAdapter.publicKey;
  
    return await sendTransactionWithLogs(connection, walletAdapter, tx);
}



