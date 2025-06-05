import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import { groth16 } from "snarkjs";
import { poseidon3 } from "poseidon-lite";
// import { buildPoseidon } from "circomlibjs";
// or your poseidon import
import { bigIntToU8Array,sendTransactionWithLogs, to32, g1Uncompressed, g2Uncompressed, attachMemoIfNeeded, maybeAddSmallTreeMemo, to8BE, parseMerkleMountainRange, getPoseidonBytes } from "./utils.js";
import {
  PROGRAM_ID,
  VARIABLE_POOL_SEED,
  instructionDiscriminators,
  LEAVES_INDEXER_SEED,
  SUBTREE_INDEXER_SEED,
  TREE_DEPTH_LARGE_ARRAY,
} from "./constants.js";
import { loadNotes, saveNotes, generateNullifier } from "./noteStorage.js";
import {buildBn128, utils} from "ffjavascript";



export async function depositRepeatedly(
  connection,
  walletAdapter,
  identifier 
) {
  if (!walletAdapter.publicKey) {
    throw new Error("Wallet not connected");
  }

  // 1) How many deposits of 1_000_000 lamports?
  const raw = prompt("How many deposits of 1 000 000 lamports would you like to make?");
  const count = Number(raw);
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("Invalid number of deposits");
  }

  // 2) Ask for pool identifier if not provided
  if (!identifier || !identifier.trim()) {
    identifier = prompt("Enter pool identifier (max 16 chars):") || "";
  }
  identifier = identifier.slice(0, 16);

  // 3) Before looping, load whatever notes are already in localStorage:
  const key = walletAdapter.publicKey.toBase58();
  const existingNotes = await loadNotes(key);

  // 4) For each deposit, 
  //     a) generate TWO brand‐new nullifiers,
  //     b) call depositVariable(...), 
  //     c) append two leaves into localStorage
  for (let i = 1; i <= count; i++) {
    console.log(`🔄 Deposit #${i} of ${count}…`);

    // generate two independent nullifiers
    const null1 = generateNullifier();
    const null2 = generateNullifier();

    // both leaves are 1_000_000 lamports = 0.001 SOL each:
    const lamports = 1_000_000;
    
    // on‐chain call: deposit two leaves of 1_000_000 lamports each
    const sig = await depositVariable(
      connection,
      walletAdapter,
      identifier,
      [lamports, lamports],
      [null1, null2]
    );
    console.log("On‐chain signature:", sig);

    // Convert lamports → SOL (for local “notes” array)
    const solAmt = lamports / 1e9; // 0.001


    // create two note‐objects in the same shape as your other code expects:
    const newNote1 = {
      id: getPoseidonBytes(solAmt, null1, 0).toString("hex"),
      amount: solAmt,
      nullifier: null1,
      timestamp: Date.now(),
      nullifierHash: "",
      poolId: identifier,
    };
    const newNote2 = {
      id: getPoseidonBytes(solAmt, null2, 0).toString("hex"),
      amount: solAmt,
      nullifier: null2,
      timestamp: Date.now(),
      nullifierHash: "",
      poolId: identifier,
    };

    // append them to the array
    existingNotes.push(newNote1, newNote2);

    console.log(`✅ Finished deposit #${i}`);
  }

  // 5) Write everything back into localStorage and trigger a UI refresh
  await saveNotes(key, existingNotes);
  window.dispatchEvent(new Event("notesChanged"));
  console.log(`✅ Completed ${count} deposits and saved notes locally.`);
}

export async function depositVariable(
  connection,
  walletAdapter,
  identifier,
  values,
  nulls
) {
  if (!walletAdapter.publicKey) throw new Error("Wallet not connected");
  // 1) Prompt if not passed in
  if (!identifier) {
    identifier = prompt("Enter pool identifier (max 16 chars):") || "";
  }
  if (!values || !values.length) {
    const v1 = Number(prompt("Value 1 (lamports):") || "0");
    const v2 = Number(prompt("Value 2 (lamports):") || "0");
    values = v2 ? [v1, v2] : [v1];    
    nulls = values.map((_, i) =>
      prompt(`Nullifier ${i + 1} (string):`) || ""
    );
  }
  
  // 2) Derive PDA
  const idBuf = Buffer.alloc(16);
  idBuf.write(identifier, 0, "utf8");
  const [poolPDA] = PublicKey.findProgramAddressSync(
    [VARIABLE_POOL_SEED, idBuf],
    PROGRAM_ID
  );

  // 3) Fetch on-chain state
  const acct = await connection.getAccountInfo(poolPDA);
  if (!acct) throw new Error("Pool not found");
  const merkleMountainRange = parseMerkleMountainRange(acct.data, TREE_DEPTH_LARGE_ARRAY);
    
  const lastSmallTreeRoot = merkleMountainRange.lastSmallTreeRoot;
  const batchNum = merkleMountainRange.batchNumber;
  
  const dataArr = Buffer.from(acct.data);

  
  // 4) Native SOL assetId
  // const assetIdBig = pubkeyToBigInt(
  //   "So11111111111111111111111111111111111111111"
  // );
  const assetIdBig = 0n;

  // 5) Build Poseidon leaves: (amount, nullifier, assetId)
  const leaves = values.map((v, i) => {
    const nullifierBig = BigInt(
      "0x" + Buffer.from(nulls[i], "utf8").toString("hex")
    );
    return poseidon3([BigInt(v), nullifierBig, assetIdBig]);
  });
  
  // 6) Build SNARK input for 2-leaf circuit
  const sum = BigInt(values.reduce((a, b) => a + b, 0));
  

  // 7) Choose circuit based on number of leaves
  let proof, publicSignals, pubBuf;
  if (values.length === 1) {
    const snarkInput1 = {
      nullifier: BigInt("0x" + Buffer.from(nulls[0], "utf8").toString("hex")).toString(),
      assetId: assetIdBig.toString(),
      val: BigInt(values[0]).toString(),
      leaf: leaves[0]?.toString() || "0",      
    };
    console.log("Proof for single leaf deposit");
    // single-leaf circuit
    const wasm = "/circuits/DepositCircuit1/DepositCircuit1_js/DepositCircuit1.wasm";
    const zkey = "/circuits/DepositCircuit1/deposit1_final.zkey";
    
    ({ proof, publicSignals } = await groth16.fullProve(
      snarkInput1,
      wasm,
      zkey
    ));
    console.log("Proof finished");
    const [val, leafSig] = publicSignals.map((s) => BigInt(s));

    pubBuf =Buffer.concat([
      to8BE(val),
      to32(leafSig),
      to32(BigInt(0n)),
    ]
  )
  } else {
    const snarkInput2 = {
      val1: BigInt(values[0]).toString(),
      nullifier1: BigInt("0x" + Buffer.from(nulls[0], "utf8").toString("hex")).toString(),
      assetId1: assetIdBig.toString(),
  
      val2: values[1] ? BigInt(values[1]).toString() : "0",
      nullifier2: values[1]
        ? BigInt("0x" + Buffer.from(nulls[1], "utf8").toString("hex")).toString()
        : "0",
      assetId2: assetIdBig.toString(),
      sum: sum.toString(),
      leaf1: leaves[0].toString(),
      leaf2: leaves[1]?.toString() || "0",
    };
    // two-leaf circuit
    console.log("Proof for two leaves deposit");
    const wasm = "/circuits/DepositCircuit2/DepositCircuit2_js/DepositCircuit2.wasm";
    const zkey = "/circuits/DepositCircuit2/deposit2_final.zkey";
    ({ proof, publicSignals } = await groth16.fullProve(
      snarkInput2,
      wasm,
      zkey
    ));
    console.log("Proof finished");
    // publicSignals = [ sum, leaf1, leaf2 ]
    const [sumSig, leaf1Sig, leaf2Sig] = publicSignals.map((s) => BigInt(s));
    // instead of to32(sumSig), do just an 8‐byte BE:
    const sumBuf = to8BE(sumSig);

    // now
    console.log("leaf1 as bigint ", leaf1Sig);
    console.log("leaf1 as U8 array", bigIntToU8Array(leaf1Sig));
    pubBuf = Buffer.concat([
      sumBuf,                      // 8 bytes
      to32(leaf1Sig),              // 32 bytes
      to32(leaf2Sig)               // 32 bytes
    ]);
  }
  console.log("Compressing proof");

  // 8) Serialize proof πA, πB, πC
  const { unstringifyBigInts } = utils;
  const proofBI = unstringifyBigInts(proof);
  const curve = await buildBn128();
  const pi_a = g1Uncompressed(curve, proofBI.pi_a);
  const pi_b = g2Uncompressed(curve, proofBI.pi_b);
  const pi_c = g1Uncompressed(curve, proofBI.pi_c);

  console.log("Proof compressed");

  const disc = new Uint8Array(
    instructionDiscriminators.deposit_variable
  );
  const ixData = Buffer.concat([disc, pi_a, pi_b, pi_c, pubBuf]);
  console.log("ixData: ", ixData);
  console.log("PubBuf: ", pubBuf);
  const depositIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: poolPDA, isSigner: false, isWritable: true },
      { pubkey: walletAdapter.publicKey, isSigner: true, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: ixData,
  });

  // 2) Build a fresh Tx
  const tx = new Transaction();
  // 1) build your memo instructions
  const instrs = [];

  // sub‐batch memo
  if (await attachMemoIfNeeded(dataArr, leaves, instrs)) {
    console.log("📝 Sub‐batch memo attached");
    const [leavesIndexer] = PublicKey.findProgramAddressSync(
      [LEAVES_INDEXER_SEED, idBuf],
      PROGRAM_ID
    );
    // **append** the indexer PDA to your depositIx keys
    depositIx.keys.push({
      pubkey: leavesIndexer,
      isSigner: false,
      isWritable: false,
    });
    console.log("🗂️  Added leaves_indexer to depositIx");
    
  }

  // small‐tree memo
  if (await maybeAddSmallTreeMemo(batchNum, lastSmallTreeRoot, instrs)) {
    console.log("Adding small tree memoIx");
    const [subtreeIndexer] = PublicKey.findProgramAddressSync(
      [SUBTREE_INDEXER_SEED, idBuf],
      PROGRAM_ID
    );
    const [leavesIndexer] = PublicKey.findProgramAddressSync(
      [LEAVES_INDEXER_SEED, idBuf],
      PROGRAM_ID
    );
    // **append** the indexer PDA to your depositIx keys
    depositIx.keys.push({
      pubkey: leavesIndexer,
      isSigner: false,
      isWritable: false,
    });
    depositIx.keys.push({
      pubkey: subtreeIndexer,
      isSigner: false,
      isWritable: false,
    });
  }

  // 3) put them in the exact order you need
  instrs.push(depositIx);

  // 4) finally the ComputeBudget tweak
  instrs.push(ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }));

  // 5) assign them directly
  tx.instructions = instrs;

  // 7) Set blockhash & feePayer
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = walletAdapter.publicKey;

  return await sendTransactionWithLogs(connection, walletAdapter, tx)

}
