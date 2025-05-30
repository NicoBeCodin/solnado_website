// src/components/ActionsCard.tsx
"use client";
import React, { useState } from "react";
import { useConnection, useWallet, WalletContextState } from "@solana/wallet-adapter-react";
import { initializeVariablePool } from "../lib/pool.js";
import {depositRepeatedly, depositVariable} from "../lib/deposit.js";
import {transfer, chooseTransfer} from "../lib/transfer.js";
import { error } from "console";
import { Connection } from "@solana/web3.js";

type Props = {
  onDeposit(): void;
  onTransfer(): void;
  onWithdraw(): void;
};

type Notification = {
  type: "success" | "error";
  message: string;
};

export function ActionsCard({ onDeposit, onTransfer, onWithdraw }: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Show toast and auto-hide
  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 15000);
  };

  const handleInitPool = async () => {
    try {
      const id = prompt("Enter pool identifier (max 16 chars):");
      if (!id) return;

      const signature  = await initializeVariablePool(
        connection,
        wallet,
        id
      );

      showToast("success", `Pool initialized: ${signature}`);      
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      // Anchor errors often attach `err.logs`
      if (Array.isArray(err.logs)) {
        console.groupCollapsed("❌ Program error logs");
        err.logs.forEach((l: string) => console.log(l));
        console.groupEnd();
      }
      showToast("error", `Init failed: ${msg}`);
      console.error(err);
    }
  };

  const handleDeposit = async () => {
    try {
      const { signature} = await depositVariable(
        connection,
        wallet,
        null,    // will prompt for identifier
        null,    // will prompt for values
        null     // will prompt for nullifiers
      );
      showToast("success", `Deposit sent: ${signature}`);
    } catch (err: any) {
      const msg = err.message || String(err);
      showToast("error", `Deposit failed: ${msg}`);
      if (Array.isArray(err.logs)) {
        console.groupCollapsed("❌ Deposit error logs");
        err.logs.forEach((l: string) => console.log(l));
        console.groupEnd();
      }
    }
  };
  const handleTransfer = async () => {
    try {
      const signature = await chooseTransfer(
        connection,
        wallet,
        null,
      );
      setToast({ type: "success", message: `Combine tx: ${signature}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setToast({ type: "error", message: `Combine failed: ${msg}` });
    }
  };


 const handleMultiDeposit = async () => {
     try {
       // identifier null ⇒ prompt inside depositRepeatedly
       const count = await depositRepeatedly(connection, wallet, null);
       showToast("success", `Did ${count} deposits of 1 000 000 lamports`);
     } catch (err: any) {
       const msg = err instanceof Error ? err.message : String(err);
       showToast("error", `Multi‐deposit failed: ${msg}`);
     }
   };


  return (
    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6 flex flex-col gap-4 shadow-lg">
      <div className="text-gray-400 uppercase tracking-wide">Actions</div>

      <button
        onClick={handleDeposit}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-500 hover:to-blue-700 text-black font-semibold drop-shadow-lg"
      >
        Deposit
      </button>

     <button
       onClick={handleMultiDeposit}
       className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-400 to-red-600 hover:from-pink-500 hover:to-red-700 text-black font-semibold drop-shadow-lg"
     >
       Multiple Deposits
     </button>

      <button
        onClick={handleTransfer}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-yellow-400 to-green-600 hover:from-cyan-500 hover:to-green-700 text-black font-semibold drop-shadow-lg"
      >
        Transfer (combine)
      </button>
      {toast && (
        <div className={`fixed bottom-4 w-[80vw] max-h-[50vh] overflow-auto p-4
          ${toast.type==="success"?"bg-green-600":"bg-red-600"} text-white rounded-lg`}>
          <pre className="whitespace-pre-wrap">{toast.message}</pre>
        </div>
      )}

      <button
        onClick={onWithdraw}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-green-400 to-lime-600 hover:from-green-500 hover:to-lime-700 text-black font-semibold drop-shadow-lg"
      >
        Withdraw
      </button>
      <button
        onClick={handleInitPool}
        className="mt-4 w-full py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-semibold drop-shadow-md"
      >
        Initialize Pool
      </button>
      

      {/* Toast overlay */}
      {toast && (
  <div
    className={`
      fixed bottom-4 left-1/2 transform -translate-x-1/2
      w-[80vw] max-w-3xl max-h-[50vh]
      overflow-auto p-6 rounded-2xl
      ${toast.type === "success" ? "bg-green-600" : "bg-red-600"}
      text-white shadow-xl
    `}
  >
    <pre className="whitespace-pre-wrap break-words text-sm">
      {toast.message}
    </pre>
  </div>
)}

    </div>
  );
}

