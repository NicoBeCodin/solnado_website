import {
    PublicKey,
    Transaction,
    TransactionInstruction,
    ComputeBudgetProgram,
    SystemProgram,
    
} from "@solana/web3.js";
import { groth16 } from "snarkjs";
import { poseidon1, poseidon2, poseidon3 } from "poseidon-lite";
// import { buildPoseidon } from "circomlibjs";
// or your poseidon import
import { bigIntToU8Array, sendTransactionWithLogs, getMerkleProof, to32, g1Uncompressed, g2Uncompressed, attachMemoIfNeeded, maybeAddSmallTreeMemo, to8BE, parseMerkleMountainRange, getVariableBatchesFromMemos, padWithDefaultLeaves, buildMerkleTree } from "./utils.js";
import {
    PROGRAM_ID,
    VARIABLE_POOL_SEED,
    instructionDiscriminators,
    LEAVES_INDEXER_SEED,
    SUBTREE_INDEXER_SEED,
    TREE_DEPTH_LARGE_ARRAY,
    TARGET_DEPTH,
} from "./constants.js";
import {buildBn128, utils} from "ffjavascript";

export async function chooseWithdraw(connection, walletAdapter, identifier) {
    if (!walletAdapter.publicKey) throw new Error("Wallet not connected");
    if (!identifier) {
        identifier = prompt("Enter pool identifier (max 16 chars):") || "";
    }



    const mode = Number(prompt(
        `Combine mode?\n` +
        `0 = Withdraw\n` +
        `1 = Withdraw and add a leaf\n` +
        `2 = Generate a withdraw on behalf note` +
            `3 = Withdraw on behalf`
    ));
    if (![0, 1, 2].includes(mode)) throw new Error("Invalid mode");
    switch (mode) {
        case 0:
            return await withdraw(connection, walletAdapter, identifier, value, nullifier);
        case 1:
            return await withdrawAndAdd(connection, walletAdapter, identifier, value, nullifier, amountToWithdraw, newNullifier);
        case 2:
            alert("Coming soon...");
        case 3:
            alert("Coming soon..");
        default:
            alert("What are you doing ??");
    }

}


export async function withdraw(connection, walletAdapter, identifier, value, nullifier) {
    //proof generation
    if (!value || !nullifier) {
        value = BigInt(prompt("Note value (u64): "));
        nullifier = prompt("Nullifier string: ");
    }    
    if (!identifier) {
        identifier = prompt("Enter pool identifier (max 16 chars):") || "";
    }
    const assetId = BigInt(0);//0 for SOL
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
    const merkleMountainRange = parseMerkleMountainRange(acct.data, TREE_DEPTH_LARGE_ARRAY);

    // turn into BigInts
    const nullifierBigInt = BigInt("0x" + Buffer.from(nullifier, "utf8").toString("hex"));

    // compute leaf and nullifierHash
    const leaf = poseidon3([value, nullifierBigInt, assetId]);
    const nullifierHash = poseidon1([nullifierBigInt]);

    // const onchainRootBigInt = BigInt("Ox" + onchainRoot.toString("hex"));

    let onchainRoot = merkleMountainRange.wholeTreeRoot;
    const onchainRootBigInt = BigInt("0x" + onchainRoot.toString("hex"));

    // 3) Pull and assemble all sub-batches
    const batches = await getVariableBatchesFromMemos(connection, leavesIndexerPDA);
    const flatLeaves = batches.flatMap(b => b.leaves);

    // 4) Compute default hashes up to TARGET_DEPTH
    const defaultHash = [0n];
    for (let d = 1; d <= TARGET_DEPTH; d++) {
        defaultHash[d] = poseidon2([defaultHash[d - 1], defaultHash[d - 1]]);
        // let defaultHashBytes = bigIntToU8Array(defaultHash[d]);
        //   console.log(`default hash ${d} : ${defaultHashBytes}`);
    }


    // 5) Pad to next power-of-two then build minimal subtree
    const padded = padWithDefaultLeaves(flatLeaves);
    const subtree = buildMerkleTree(padded);
    const subDepth = subtree.length;
    let subtreeRoot = subtree[subDepth - 1][0];
    console.log("subtreeRoot: ", subtreeRoot);
    console.log("Onchain root: ", onchainRootBigInt);

    // 7) Find your leaf index in padded[] and get its Merkle proof
    const idx = padded.findIndex(x => x === leaf);
    if (idx < 0) throw new Error("Your note leaf not found on-chain");
    console.log("Found leaf at index: ", idx);
    const subPath = getMerkleProof(subtree, idx);

    // 8) Extend with default siblings, then reverse for circom ordering
    const siblingsNeeded = TARGET_DEPTH - subPath.length;
    const fullPath = subPath.concat(
        Array.from({ length: siblingsNeeded }, (_, i) =>
            defaultHash[subPath.length + i])
    );

    let fullRoot = subtreeRoot;
    for (let j = 0; j < siblingsNeeded; j++) {
        fullRoot = poseidon2([fullRoot, defaultHash[subPath.length + j]]);
    }

    const siblings = fullPath.slice().reverse().map(x => x.toString());

    // 9) Build the snark input
    const circuitInput = {
        key: idx,
        val: value.toString(),
        nullifier: nullifierBigInt.toString(),
        nullifierHash: nullifierHash.toString(),
        assetId: assetId,
        root: fullRoot.toString(),
        siblings: siblings,
    };
    console.log("WithdrawVariable circuit input:", circuitInput);

    // 10) Run groth16.fullProve against your compiled circuit
    const wasmPath = "/circuits/WithdrawVariable/WithdrawVariable_js/WithdrawVariable.wasm";
    const zkeyPath = "/circuits/WithdrawVariable/WithdrawVariable.zkey";
    const { proof, publicSignals } = await groth16.fullProve(
        circuitInput,
        wasmPath,
        zkeyPath
    );
      console.log("test");

    const sigs = publicSignals.map(s => BigInt(s));
    const pubBuf = Buffer.concat([
        to32(sigs[0]),  // nullHash1
        to32(sigs[1]),  // assetId
        to8BE(value_number),  // val
        to32(sigs[3]),  // root
    ]);


    // — 9) Serialize proof πA/πB/πC —
    const { unstringifyBigInts } = utils;
    const proofBI = unstringifyBigInts(proof);
    const curve = await buildBn128();
    const pi_a = g1Uncompressed(curve, proofBI.pi_a);
    const pi_b = g2Uncompressed(curve, proofBI.pi_b);
    const pi_c = g1Uncompressed(curve, proofBI.pi_c);

    const disc = new Uint8Array(instructionDiscriminators.withdraw_variable);

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


    const keys = [
        { pubkey: poolPDA, isSigner: false, isWritable: true },
        { pubkey: null1PDA, isSigner: false, isWritable: true },
        { pubkey: walletAdapter.publicKey, isSigner: true, isWritable: true }, // user
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
    //Not appending any leaf so no need for memo

    const tx = new Transaction();
    const instrs = [];

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

export async function withdrawAndAdd(connection, walletAdapter, identifier, value, nullifier, withdrawAmount, newNullifier) {
    //proof generation
    if (!value || !nullifier) {
        // value = Number(prompt("Note value (u64): "));
        // nullifier = prompt("Nullifier string: ");
        value = 1000000;
        nullifier = "null2"
    }
    if (!withdrawAmount || !newNullifier){
        // withdrawAmount = Number(prompt("How much would you like to withdraw ?"));
        // newNullifier = prompt("Enter new nullifier: ");
        withdrawAmount = 400000;
        newNullifier = "n400";
        
    }
    if (withdrawAmount > value) {
        console.error("Withdrawing more than is available");
    }
    //Value that will go in the the leaf
    let newValue = BigInt(value - withdrawAmount);
    const value_number = value;
    value = BigInt(value);
    withdrawAmount = BigInt(withdrawAmount);
    
    // const secret = 10000;
    // const nullifier = "test10000";
    const assetId = BigInt(0);//0 for SOL

    if (!identifier) {
        identifier = prompt("Enter pool identifier (max 16 chars):") || "";
    }
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
    const dataArr = acct.data;
    const merkleMountainRange = parseMerkleMountainRange(dataArr, TREE_DEPTH_LARGE_ARRAY);

    // turn into BigInts
    const nullifierBigInt = BigInt("0x" + Buffer.from(nullifier, "utf8").toString("hex"));
    const newNullifierBigInt  =  BigInt("0x" + Buffer.from(newNullifier, "utf8").toString("hex"));
    const lastSmallTreeRoot = merkleMountainRange.lastSmallTreeRoot;
    const batchNum = merkleMountainRange.batchNumber;

    // compute leaf and nullifierHash
    const leaf = poseidon3([value, nullifierBigInt, assetId]);
    const newLeaf = poseidon3([newValue, newNullifierBigInt, assetId]);
    const nullifierHash = poseidon1([nullifierBigInt]);

    // const onchainRootBigInt = BigInt("Ox" + onchainRoot.toString("hex"));

    let onchainRoot = merkleMountainRange.wholeTreeRoot;
    const onchainRootBigInt = BigInt("0x" + onchainRoot.toString("hex"));

    // 3) Pull and assemble all sub-batches
    const batches = await getVariableBatchesFromMemos(connection, leavesIndexerPDA);
    const flatLeaves = batches.flatMap(b => b.leaves);

    // 4) Compute default hashes up to TARGET_DEPTH
    const defaultHash = [0n];
    for (let d = 1; d <= TARGET_DEPTH; d++) {
        defaultHash[d] = poseidon2([defaultHash[d - 1], defaultHash[d - 1]]);
    }

    // 5) Pad to next power-of-two then build minimal subtree
    const padded = padWithDefaultLeaves(flatLeaves);
    const subtree = buildMerkleTree(padded);
    const subDepth = subtree.length;
    let subtreeRoot = subtree[subDepth - 1][0];
    console.log("subtreeRoot: ", subtreeRoot);
    console.log("Onchain root: ", onchainRootBigInt);

    // 7) Find your leaf index in padded[] and get its Merkle proof
    const idx = padded.findIndex(x => x === leaf);
    if (idx < 0) throw new Error("Your note leaf not found on-chain");
    console.log("Found leaf at index: ", idx);
    const subPath = getMerkleProof(subtree, idx);

    // 8) Extend with default siblings, then reverse for circom ordering
    const siblingsNeeded = TARGET_DEPTH - subPath.length;
    const fullPath = subPath.concat(
        Array.from({ length: siblingsNeeded }, (_, i) =>
            defaultHash[subPath.length + i])
    );

    let fullRoot = subtreeRoot;
    for (let j = 0; j < siblingsNeeded; j++) {
        fullRoot = poseidon2([fullRoot, defaultHash[subPath.length + j]]);
    }

    const siblings = fullPath.slice().reverse().map(x => x.toString());

    // 9) Build the snark input
    const circuitInput = {
        key: idx,
        oldVal: value.toString(),
        nullifier: nullifierBigInt,
        nullifierHash: nullifierHash,
        assetId: assetId,
        root: fullRoot.toString(),
        siblings: siblings,
        withdrawAmount: withdrawAmount.toString(),
        newVal : newValue.toString(),
        newNull: newNullifierBigInt,
        newLeaf: newLeaf.toString()
    };
    console.log("WithdrawVariable circuit input:", circuitInput);

    // 10) Run groth16.fullProve against your compiled circuit
    const wasmPath = "/circuits/WithdrawAndAdd/WithdrawAndAdd_js/WithdrawAndAdd.wasm";
    const zkeyPath = "/circuits/WithdrawAndAdd/WithdrawAndAdd.zkey";
    const { proof, publicSignals } = await groth16.fullProve(
        circuitInput,
        wasmPath,
        zkeyPath
    );
      console.log("testt");

    const sigs = publicSignals.map(s => BigInt(s));
    const pubBuf = Buffer.concat([
        to32(sigs[0]),  // nullHash1
        to32(sigs[1]),  // assetId
        to8BE(withdrawAmount),  // val
        to32(sigs[3]), //new leaf
        to32(sigs[4]),  // root
    ]);  
    console.log("testsss");


    // — 9) Serialize proof πA/πB/πC —
    const { unstringifyBigInts } = utils;
    const proofBI = unstringifyBigInts(proof);
    const curve = await buildBn128();
    const pi_a = g1Uncompressed(curve, proofBI.pi_a);
    const pi_b = g2Uncompressed(curve, proofBI.pi_b);
    const pi_c = g1Uncompressed(curve, proofBI.pi_c);

    const disc = new Uint8Array(instructionDiscriminators.withdraw_variable);

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

    const keys = [
        { pubkey: poolPDA, isSigner: false, isWritable: true },
        { pubkey: null1PDA, isSigner: false, isWritable: true },
        { pubkey: walletAdapter.publicKey, isSigner: true, isWritable: true }, // user
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ];
      const tx = new Transaction();
      const instrs = [];

    if (await attachMemoIfNeeded(dataArr, [newLeaf], instrs)) {
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
    console.log("testl");

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
  console.log("test");

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