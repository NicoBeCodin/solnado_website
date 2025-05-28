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
import { buildPoseidon } from "circomlibjs";
// or your poseidon import
import { sendTransactionWithLogs, pubkeyToBigInt, to32, g1Uncompressed, g2Uncompressed, attachMemoIfNeeded, maybeAddSmallTreeMemo, to8BE } from "./utils.js";
import {
  PROGRAM_ID,
  VARIABLE_POOL_SEED,
  MEMO_PROGRAM_ID,
  SUB_BATCH_SIZE,
  BATCH_LENGTH,
  instructionDiscriminators,
  LEAVES_INDEXER_SEED,
  SUBTREE_INDEXER_SEED,
} from "./constants.js";
const { buildBn128, utils } = require("ffjavascript");
const { unstringifyBigInts } = utils;

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
    // const v1 = Number(prompt("Value 1 (lamports):") || "0");
    const v1 = 1400000;
    // const v2 = Number(prompt("Value 2 (lamports):") || "0");
    const v2=null;
    values = v2 ? [v1, v2] : [v1];    
  }
  // nulls = values.map((_, i) =>
  //   prompt(`Nullifier ${i + 1} (string):`) || ""
  // );
  nulls = "nul1400000";

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
  const dataArr = Buffer.from(acct.data);
  const dv = new DataView(
    dataArr.buffer,
    dataArr.byteOffset,
    dataArr.byteLength
  );

  const batchNum = dv.getBigUint64(640, true); // little-endian u64  
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
  if (await attachMemoIfNeeded(tx, dataArr, leaves, instrs)) {
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
  if (await maybeAddSmallTreeMemo(/* same fresh Tx? */ Number(batchNum), dataArr.slice(576, 608), instrs)) {
    console.log("Adding small tree memoIx");
    const [subtreeIndexer] = PublicKey.findProgramAddressSync(
      [SUBTREE_INDEXER_SEED, idBuf],
      PROGRAM_ID
    );
    // **append** the indexer PDA to your depositIx keys
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

  //For debugging

  // console.log("=== depositIx.keys ===");
  // depositIx.keys.forEach((kt, idx) => {
  //   console.log(
  //     idx,
  //     kt.pubkey.toBase58(),
  //     " signer?", kt.isSigner,
  //     " write?", kt.isWritable
  //   );
  // });

  // console.log("=== tx.instructions ===");
  // tx.instructions.forEach((ix, idx) => {
  //   console.log(
  //     idx,
  //     ix.programId.toBase58(),
  //     " keys:", ix.keys.map((k) => k.pubkey.toBase58()).join(", ")
  //   );
  // });

  // // 8) Finally, log out the full instruction list one more time
  // console.log("== Final instruction order ==");
  // tx.instructions.forEach((ix, i) => {
  //   console.log(i, ix.programId.toBase58());
  // });

  // 9) Send
  return await sendTransactionWithLogs(connection, walletAdapter, tx)
}
