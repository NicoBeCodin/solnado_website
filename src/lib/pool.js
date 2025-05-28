// src/lib/pool.js
import {
    PublicKey,
    SystemProgram,
    TransactionInstruction, Transaction
  } from "@solana/web3.js";
  import { ComputeBudgetProgram } from "@solana/web3.js";
  import {  sendTransactionWithLogs } from "./utils.js"; // assume you already have this
  import { VARIABLE_POOL_SEED, PROGRAM_ID, instructionDiscriminators, LEAVES_INDEXER_SEED, SUBTREE_INDEXER_SEED } from "./constants.js";
  
  /**
   * Initialize a new variable‐size pool on‐chain.
   * @param {Connection} connection
   * @param {WalletAdapter} walletAdapter
   * @param {string} identifierString
   */
  export async function initializeVariablePool(
    connection,
    walletAdapter,
    identifierString
  ) {
    if (!walletAdapter.publicKey) throw new Error("Wallet not connected");
  
    // 1) Build the 16-byte identifier buffer
    const idBuf = Buffer.alloc(16);
    idBuf.write(identifierString, 0, "utf8");
  
    // 2) Derive PDAs
    const [poolPDA, poolBump] = PublicKey.findProgramAddressSync(
      [VARIABLE_POOL_SEED, idBuf],
      PROGRAM_ID
    );
    const [leavesPDA] = PublicKey.findProgramAddressSync(
      [LEAVES_INDEXER_SEED, idBuf],
      PROGRAM_ID
    );


    const [subtreePDA] = PublicKey.findProgramAddressSync(
      [SUBTREE_INDEXER_SEED, idBuf],
      PROGRAM_ID
    );
  
    // 3) Check if already exists
    const info = await connection.getAccountInfo(poolPDA);
    if (info) {
      throw new Error("Pool already initialized");
    }
  
    // 4) Build the instruction data: discriminator || identifier
    const disc =new Uint8Array(instructionDiscriminators.initialize_variable_pool);
    const data = Buffer.concat([disc, idBuf]);
  
    // 5) Assemble the TransactionInstruction
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: poolPDA, isSigner: false, isWritable: true },
        { pubkey: leavesPDA, isSigner: false, isWritable: true },
        { pubkey: subtreePDA, isSigner: false, isWritable: true },
        { pubkey: walletAdapter.publicKey, isSigner: true,  isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
  
    // 6) Add a ComputeBudget tweak if you need more units
    const transaction = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
        ix
      );
      
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletAdapter.publicKey;

    return await sendTransactionWithLogs(connection, walletAdapter, transaction);

  }
  