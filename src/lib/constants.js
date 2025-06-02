import { PublicKey, Connection, clusterApiUrl,  } from "@solana/web3.js";



export const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);
export const MAX_TREE_DEPTH = 30;
export const TREE_DEPTH_LARGE_ARRAY = 26;
export const DEVNET_RPC_URL = "https://api.devnet.solana.com";
export const CONNECTION = new Connection(clusterApiUrl("devnet"), "confirmed");
export const PROGRAM_ID = new PublicKey("2xJgeatVVK3u3SNf4pyXuLuc2UrzEQBprPds2qfJSuEt");
export const VARIABLE_POOL_SEED = Buffer.from("variable_pool");
export const LEAVES_INDEXER_SEED = Buffer.from("leaves_indexer");
export const SUBTREE_INDEXER_SEED = Buffer.from("subtree_indexer");
export const BATCH_LENGTH = 16;
export const BATCHES_PER_SMALL_TREE = 4096;
export const SUB_BATCH_SIZE = 8;
export const TARGET_DEPTH = 30;

// instruction_discriminators.js

export const instructionDiscriminators = {
  admin_transfer: [196, 77, 244, 188, 16, 7, 192, 73],
  combine_deposit: [39, 223, 245, 15, 137, 248, 172, 123],
  deposit: [242, 35, 198, 137, 82, 225, 242, 182],
  deposit_variable: [104, 25, 238, 179, 167, 145, 228, 124],
  initialize_pool: [95, 180, 10, 172, 84, 174, 232, 40],
  initialize_treasury: [124, 186, 211, 195, 85, 165, 129, 166],
  initialize_variable_pool: [252, 91, 164, 153, 40, 109, 84, 2],
  withdraw: [183, 18, 70, 156, 148, 109, 161, 34],
  withdraw_from_treasury: [0, 164, 86, 76, 56, 72, 12, 170],
  withdraw_on_behalf: [124, 9, 96, 246, 207, 245, 72, 121],
  withdraw_variable: [118, 184, 103, 201, 218, 242, 156, 230],
};

