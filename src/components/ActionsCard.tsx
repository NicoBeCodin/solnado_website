// src/components/ActionsCard.tsx
"use client";

import React, { useState, ChangeEvent, FormEvent } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {initializeVariablePool} from "../lib/pool.js"
import {
  depositRepeatedly,
  depositVariable,
} from "../lib/deposit.js";
import { chooseTransfer } from "../lib/transfer.js";
import { chooseWithdraw } from "../lib/withdraw.js";
import { Connection } from "@solana/web3.js";

type Props = {
  onDeposit(): void;
  onTransfer(): void;
  onWithdraw(): void;
};

type Toast = {
  type: "success" | "error";
  message: string;
};

export function ActionsCard({ onDeposit, onTransfer, onWithdraw }: Props) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [toast, setToast] = useState<Toast | null>(null);

  // Controls for showing/hiding the deposit form
  const [showDepositForm, setShowDepositForm] = useState(false);

  // Deposit form state
  const [depositIdentifier, setDepositIdentifier] = useState("");
  const [depositCount, setDepositCount] = useState<1 | 2>(1);
  const [depositAmounts, setDepositAmounts] = useState<string[]>(["", ""]);
  const [depositNulls, setDepositNulls] = useState<string[]>(["", ""]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Dev‐Options section toggle
  const [showDevOptions, setShowDevOptions] = useState(false);

  // Toast helper
  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 10000);
  };

  // ────────────────────────────────────────────────────────────────
  // Initialize Pool
  // ────────────────────────────────────────────────────────────────
  const handleInitPool = async () => {
    try {
      if (!wallet.publicKey) throw new Error("Wallet not connected");

      if (!depositIdentifier) {
        showToast("error", "Please enter a pool identifier.");
        return;
      }

      const sig = await initializeVariablePool(
        connection,
        wallet,
        depositIdentifier
      );
      showToast("success", `Pool initialized: ${sig}`);
      // reset form
      setDepositIdentifier("");
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      if (Array.isArray(err.logs)) {
        console.groupCollapsed("❌ Program error logs");
        err.logs.forEach((l: string) => console.log(l));
        console.groupEnd();
      }
      showToast("error", `Init failed: ${msg}`);
      console.error(err);
    }
  };

  // ────────────────────────────────────────────────────────────────
  // Single‐or‐Double Deposit
  // ────────────────────────────────────────────────────────────────
  const handleDepositFormSubmit = async (e: FormEvent) => {
  e.preventDefault();
  try {
    if (!wallet.publicKey) throw new Error("Wallet not connected");

    // Basic validation (same as before) …
    // [ … your existing checks for identifier, amounts, nullifiers … ]
    // Basic validation
      if (!depositIdentifier.trim()) {
        showToast("error", "Pool identifier is required.");
        return;
      }
      const values: number[] = [];
      const nulls: string[] = [];

      // Only use as many fields as depositCount
      for (let i = 0; i < depositCount; i++) {
        const amtStr = depositAmounts[i]?.trim();
        const nulStr = depositNulls[i]?.trim();
        if (!amtStr || isNaN(Number(amtStr)) || Number(amtStr) <= 0) {
          showToast("error", `Invalid amount for leaf ${i + 1}.`);
          return;
        }
        if (!nulStr) {
          showToast("error", `Nullifier for leaf ${i + 1} is required.`);
          return;
        }
        values.push(Number(amtStr));
        nulls.push(nulStr);
      }

    setIsProcessing(true);

    // Call depositVariable exactly as before
    const result = await depositVariable(
      connection,
      wallet,
      depositIdentifier,
      values,
      nulls
    );

    showToast("success", `Deposit sent: ${result}`);
    // close & reset
    setShowDepositForm(false);
    setDepositIdentifier("");
    setDepositAmounts(["", ""]);
    setDepositNulls(["", ""]);
    setDepositCount(1);
  } catch (err: any) {
    const msg = err.message || String(err);
    showToast("error", `Deposit failed: ${msg}`);
    if (Array.isArray(err.logs)) {
      console.groupCollapsed("❌ Deposit error logs");
      err.logs.forEach((l: string) => console.log(l));
      console.groupEnd();
    }
  } finally {
    setIsProcessing(false);
  }
};



  // Handlers for form inputs
  const handleIdentifierChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDepositIdentifier(e.target.value);
  };
  const handleCountChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const c = Number(e.target.value);
    setDepositCount(c === 2 ? 2 : 1);
  };
  const handleAmountChange = (idx: number, e: ChangeEvent<HTMLInputElement>) => {
    const arr = [...depositAmounts];
    arr[idx] = e.target.value;
    setDepositAmounts(arr);
  };
  const handleNullChange = (idx: number, e: ChangeEvent<HTMLInputElement>) => {
    const arr = [...depositNulls];
    arr[idx] = e.target.value;
    setDepositNulls(arr);
  };

  // ────────────────────────────────────────────────────────────────
  // Multiple Deposits (prompt‐based)
  // ────────────────────────────────────────────────────────────────
  const handleMultiDeposit = async () => {
    try {
      if (!wallet.publicKey) throw new Error("Wallet not connected");

      // depositRepeatedly will prompt internally for identifier & count
      const count = await depositRepeatedly(connection, wallet, null);
      showToast("success", `Did ${count} deposits`);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("error", `Multi-deposit failed: ${msg}`);
    }
  };

  // ────────────────────────────────────────────────────────────────
  // Transfer (Combine)
  // ────────────────────────────────────────────────────────────────
  const handleTransfer = async () => {
    try {
      if (!wallet.publicKey) throw new Error("Wallet not connected");
      const sig = await chooseTransfer(connection, wallet, null);
      showToast("success", `Combine tx: ${sig}`);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("error", `Combine failed: ${msg}`);
    }
  };

  // ────────────────────────────────────────────────────────────────
  // Withdraw
  // ────────────────────────────────────────────────────────────────
  const handleWithdraw = async () => {
    try {
      if (!wallet.publicKey) throw new Error("Wallet not connected");
      const sig = await chooseWithdraw(connection, wallet, null);
      showToast("success", `Withdraw sent: ${sig}`);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("error", `Withdraw failed: ${msg}`);
      if (Array.isArray(err.logs)) {
        console.groupCollapsed("❌ Withdraw error logs");
        err.logs.forEach((l: string) => console.log(l));
        console.groupEnd();
      }
    }
  };

  return (
    <div className="bg-[#111] border border-gray-800 rounded-2xl p-6 flex flex-col gap-4 shadow-lg">
      <div className="text-gray-400 uppercase tracking-wide">Actions</div>

      {/* ─────────────────────────────────────────
            Deposit Button → toggles inline form
      ───────────────────────────────────────── */}
      <button
        onClick={() => setShowDepositForm((prev) => !prev)}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-500 hover:to-blue-700 text-black font-semibold drop-shadow-lg"
      >
        Deposit
      </button>

      {showDepositForm && (
  <div
    className="
      fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center
      z-50
    "
  >
    <div className="relative w-[90vw] max-w-md bg-[#1f1f1f] border border-gray-700 rounded-xl p-6">
      {/* Close “×” button in top-right */}
      <button
        onClick={() => {
          if (!isProcessing) {
            setShowDepositForm(false);
            // reset state if you want:
            setDepositAmounts(["", ""]);
            setDepositNulls(["", ""]);
            setDepositCount(1);
            setDepositIdentifier("");
          }
        }}
        className="absolute top-3 right-3 text-gray-400 hover:text-red-500"
        disabled={isProcessing}
      >
        ×
      </button>

      <h3 className="text-white text-lg font-semibold mb-4">Deposit</h3>

      <form onSubmit={handleDepositFormSubmit} className="space-y-4">
        {/* Pool Identifier */}
        <div>
          <label className="block text-gray-300 text-sm mb-1">
            Pool Identifier
          </label>
          <input
            type="text"
            value={depositIdentifier}
            onChange={handleIdentifierChange}
            placeholder="Max 16 chars"
            maxLength={16}
            className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isProcessing}
          />
        </div>

        {/* Number of leaves (1 or 2) */}
        <div>
          <label className="block text-gray-300 text-sm mb-1">
            Number of Leaves
          </label>
          <select
            value={depositCount}
            onChange={handleCountChange}
            className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isProcessing}
          >
            <option value={1}>1 Leaf</option>
            <option value={2}>2 Leaves</option>
          </select>
        </div>

        {/* Leaf #1: amount + nullifier */}
        <div>
          <label className="block text-gray-300 text-sm mb-1">
            Leaf 1 Amount (lamports)
          </label>
          <input
            type="number"
            min="1"
            value={depositAmounts[0]}
            onChange={(e) => handleAmountChange(0, e)}
            placeholder="e.g. 1000000"
            className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isProcessing}
          />
          <label className="block text-gray-300 text-sm mt-2 mb-1">
            Leaf 1 Nullifier
          </label>
          <input
            type="text"
            value={depositNulls[0]}
            onChange={(e) => handleNullChange(0, e)}
            placeholder="Unique nullifier string"
            className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isProcessing}
          />
        </div>

        {/* Leaf #2 (conditionally shown) */}
        {depositCount === 2 && (
          <div>
            <label className="block text-gray-300 text-sm mb-1">
              Leaf 2 Amount (lamports)
            </label>
            <input
              type="number"
              min="1"
              value={depositAmounts[1]}
              onChange={(e) => handleAmountChange(1, e)}
              placeholder="e.g. 2000000"
              className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isProcessing}
            />
            <label className="block text-gray-300 text-sm mt-2 mb-1">
              Leaf 2 Nullifier
            </label>
            <input
              type="text"
              value={depositNulls[1]}
              onChange={(e) => handleNullChange(1, e)}
              placeholder="Unique nullifier string"
              className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isProcessing}
            />
          </div>
        )}

        {/* Deposit button + spinner */}
        <div className="flex justify-end">
          <button
            type="submit"
            className={`relative px-6 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60`}
            disabled={isProcessing}
          >
            {isProcessing && (
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2">
                {/* Simple spinner (Tailwind + CSS) */}
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4l3.464-3.464A7.966 7.966 
                       0 0012 4a8 8 0 000 16 7.966 7.966 0 003.536-.804L13 16v4a8 8 0 01-9-8z"
                  />
                </svg>
              </span>
            )}
            Deposit
          </button>
        </div>
      </form>
    </div>
  </div>
)}


      {/* ─────────────────────────────────────────
            Transfer / Withdraw Buttons
      ───────────────────────────────────────── */}
      <button
        onClick={handleTransfer}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-yellow-400 to-green-600 hover:from-yellow-500 hover:to-green-700 text-black font-semibold drop-shadow-lg"
      >
        Transfer (Combine)
      </button>

      <button
        onClick={handleWithdraw}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-green-400 to-lime-600 hover:from-green-500 hover:to-lime-700 text-black font-semibold drop-shadow-lg"
      >
        Withdraw
      </button>

      {/* ─────────────────────────────────────────
            Dev Options (collapsible)
      ───────────────────────────────────────── */}
      <button
        onClick={() => setShowDevOptions((prev) => !prev)}
        className="mt-4 w-full py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-semibold drop-shadow-lg"
      >
        {showDevOptions ? "Hide Developer Options" : "Show Developer Options"}
      </button>

      {showDevOptions && (
        <div className="mt-2 space-y-2 bg-[#1a1a1a] border border-gray-700 rounded-xl p-4">
          <button
            onClick={handleMultiDeposit}
            className="w-full py-2 rounded-lg bg-gradient-to-r from-pink-400 to-red-600 hover:from-pink-500 hover:to-red-700 text-black font-semibold drop-shadow-md"
          >
            Multiple Deposits
          </button>

          <button
            onClick={handleInitPool}
            className="w-full py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-semibold drop-shadow-md"
          >
            Initialize Pool
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────
            Toast Overlay
      ───────────────────────────────────────── */}
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
