// src/components/ActionsCard.tsx
"use client";

import React, { useState, ChangeEvent, FormEvent } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { initializeVariablePool } from "../lib/pool.js";
import {
  depositRepeatedly,
  depositVariable,
} from "../lib/deposit.js";
// Import the individual transfer functions
import {
  transferCombine2to1,
  transferCombine1to2, chooseTransfer
} from "../lib/transfer.js";
import {  withdraw, withdrawAndAdd } from "../lib/withdraw.js";


// type Props = {
//   onDeposit(): void;
//   onTransfer(): void;
//   onWithdraw(): void;
// };

type Toast = {
  type: "success" | "error";
  message: string;
};

export function ActionsCard() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [toast, setToast] = useState<Toast | null>(null);

  // Controls for showing/hiding the deposit form
  const [showDepositForm, setShowDepositForm] = useState(false);

  // Deposit form state
  const [identifier, setIdentifier] = useState("");
  const [depositIdentifier, setDepositIdentifier] = useState("");
  const [depositCount, setDepositCount] = useState<1 | 2>(1);
  const [depositAmounts, setDepositAmounts] = useState<string[]>(["", ""]);
  const [depositNulls, setDepositNulls] = useState<string[]>(["", ""]);
  const [isProcessingDeposit, setIsProcessingDeposit] = useState(false);

  // Controls for showing/hiding the transfer form
  const [showTransferForm, setShowTransferForm] = useState(false);

  // Transfer form state
  const [transferIdentifier, setTransferIdentifier] = useState("");
  const [transferMode, setTransferMode] = useState<0 | 1 | 2>(0);
  const [isProcessingTransfer, setIsProcessingTransfer] = useState(false);
  // ──────────────────────────────
// Add these state variables alongside the existing transfer-related state:
// ──────────────────────────────
const [t2v1, setT2V1] = useState<string>("");           // Value 1 for 2→1
const [t2n1, setT2N1] = useState<string>("");           // Nullifier 1 for 2→1
const [t2v2, setT2V2] = useState<string>("");           // Value 2 for 2→1
const [t2n2, setT2N2] = useState<string>("");           // Nullifier 2 for 2→1
const [t2newNull, setT2NewNull] = useState<string>(""); // New nullifier for 2→1

const [t1n1, setT1N1] = useState<string>("");           // Old‐leaf nullifier for 1→2
const [t1v1, setT1V1] = useState<string>("");           // Old‐leaf value for 1→2
const [t1newVal1, setT1NewVal1] = useState<string>(""); // New value 1 for 1→2
const [t1newNull1, setT1NewNull1] = useState<string>(""); // New nullifier 1 for 1→2
const [t1newNull2, setT1NewNull2] = useState<string>(""); // New nullifier 2 for 1→2

const [showWithdrawForm, setShowWithdrawForm] = useState(false);

const [withdrawIdentifier, setWithdrawIdentifier] = useState("");
const [withdrawMode, setWithdrawMode] = useState<0 | 1>(0);
const [wdValue, setWdValue] = useState<string>("");           // value to withdraw
const [wdNullifier, setWdNullifier] = useState<string>("");   // nullifier for withdraw
const [wdAddAmount, setWdAddAmount] = useState<string>("");   // amount to add if mode 1
const [wdNewNull, setWdNewNull] = useState<string>("");       // new nullifier if mode 1
const [isProcessingWithdrawForm, setIsProcessingWithdrawForm] = useState(false);
  // Controls for showing/hiding withdraw form (if needed)
  // const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  // ...withdraw state would go here...

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

      // If there's no identifier yet, ask the user for one
      if (!identifier.trim()) {
        const id = window.prompt("Enter a pool identifier (max 16 chars):", "");
        if (!id || !id.trim()) {
          showToast("error", "Pool identifier is required.");
          return;
        }
        setIdentifier(id.trim().slice(0, 16)); // Enforce max length if desired
      }

      const sig = await initializeVariablePool(
        connection,
        wallet,
        identifier
      );
      showToast("success", `Pool initialized: ${sig}`);

      // Reset any related form state, if needed
      setDepositIdentifier("");
    } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // If this error object has a `logs: string[]` field, print it:
    if (
      typeof err === "object" &&
      err !== null &&
      "logs" in err &&
      Array.isArray((err as { logs: unknown[] }).logs)
    ) {
      const maybeLogs = (err as { logs: unknown[] }).logs;
      console.groupCollapsed("❌ Program error logs");
      maybeLogs.forEach((l) => {
        if (typeof l === "string") console.log(l);
      });
      console.groupEnd();
    }
    showToast("error", `Init failed: ${msg}`);
    console.error(err);
  }
  };

  // ────────────────────────────────────────────────────────────────
  // Single‐or‐Double Deposit
  // ────────────────────────────────────────────────
  const handleDepositFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      if (!wallet.publicKey) throw new Error("Wallet not connected");

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

      setIsProcessingDeposit(true);

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
    } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast("error", `Deposit failed: ${msg}`);
    if (
      typeof err === "object" &&
      err !== null &&
      "logs" in err &&
      Array.isArray((err as { logs: unknown[] }).logs)
    ) {
      const maybeLogs = (err as { logs: unknown[] }).logs;
      console.groupCollapsed("❌ Deposit error logs");
      maybeLogs.forEach((l) => {
        if (typeof l === "string") console.log(l);
      });
      console.groupEnd();
    }
  } finally {
    setIsProcessingDeposit(false);
  }
  };

  // Handlers for deposit form inputs
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
  // Transfer (Combine) – now with a modal form
  // ────────────────────────────────────────────────────────────────
  const handleTransferFormSubmit = async (e: FormEvent) => {
  e.preventDefault();
  try {
    if (!wallet.publicKey) throw new Error("Wallet not connected");

    if (!transferIdentifier.trim()) {
      showToast("error", "Pool identifier is required.");
      return;
    }

    // Basic validation for mode‐specific fields:
    if (transferMode === 0) {
      if (
        !t2v1.trim() ||
        isNaN(Number(t2v1)) ||
        Number(t2v1) <= 0 ||
        !t2n1.trim() ||
        !t2v2.trim() ||
        isNaN(Number(t2v2)) ||
        Number(t2v2) <= 0 ||
        !t2n2.trim() ||
        !t2newNull.trim()
      ) {
        showToast("error", "All fields for Combine 2→1 are required and must be valid.");
        return;
      }
    } else if (transferMode === 1) {
      if (
        !t1n1.trim() ||
        !t1v1.trim() ||
        isNaN(Number(t1v1)) ||
        Number(t1v1) <= 0 ||
        !t1newVal1.trim() ||
        isNaN(Number(t1newVal1)) ||
        Number(t1newVal1) <= 0 ||
        !t1newNull1.trim() ||
        !t1newNull2.trim()
      ) {
        showToast("error", "All fields for Combine 1→2 are required and must be valid.");
        return;
      }
      // Compute newVal2 implicitly:
      const computedNewVal2 = Number(t1v1) - Number(t1newVal1);
      if (computedNewVal2 <= 0) {
        showToast("error", "newVal1 must be less than the old leaf value.");
        return;
      }
    }

    setIsProcessingTransfer(true);

    let sig: string;
    switch (transferMode) {
      case 0:
        // transferCombine2to1 signature:
        //   (connection, walletAdapter, identifier, v1, n1, v2, n2, newNullifier)
        sig = await transferCombine2to1(
          connection,
          wallet,
          transferIdentifier,
          Number(t2v1),
          t2n1,
          Number(t2v2),
          t2n2,
          t2newNull
        );
        showToast("success", `Combine 2→1 tx: ${sig}`);
        break;

      case 1:
        // transferCombine1to2 signature:
        //   (connection, walletAdapter, identifier, n1, v1, newVal1, newNull1, newNull2)
        sig = await transferCombine1to2(
          connection,
          wallet,
          transferIdentifier,
          t1n1,
          Number(t1v1),
          Number(t1newVal1),
          t1newNull1,
          t1newNull2
        );
        // Note: newVal2 is implicitly (v1 - newVal1) inside your logic.
        showToast("success", `Combine 1→2 tx: ${sig}`);
        break;

      case 2:
      default:
        // Fallback to prompt‐based chooseTransfer (mode 2: 2→2)
        sig = await chooseTransfer(connection, wallet, transferIdentifier);
        showToast("success", `Combine 2→2 tx (prompt-based): ${sig}`);
        break;
    }

    // Close & reset
    setShowTransferForm(false);
    setTransferIdentifier("");
    setTransferMode(0);

    // Reset all mode-specific fields:
    setT2V1("");
    setT2N1("");
    setT2V2("");
    setT2N2("");
    setT2NewNull("");
    setT1N1("");
    setT1V1("");
    setT1NewVal1("");
    setT1NewNull1("");
    setT1NewNull2("");
  } catch (err: any) {
    const msg = err.message || String(err);
    showToast("error", `Transfer failed: ${msg}`);
    if (Array.isArray(err.logs)) {
      console.groupCollapsed("❌ Transfer error logs");
      err.logs.forEach((l: string) => console.log(l));
      console.groupEnd();
    }
  } finally {
    setIsProcessingTransfer(false);
  }
};

  // Handlers for transfer form inputs
  const handleTransferIdentifierChange = (e: ChangeEvent<HTMLInputElement>) => {
    setTransferIdentifier(e.target.value);
  };
  const handleTransferModeChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const m = Number(e.target.value);
    setTransferMode(m === 1 ? 1 : m === 2 ? 2 : 0);
  };

  // ────────────────────────────────────────────────────────────────
  // Withdraw
  // ────────────────────────────────────────────────────────────────
const handleWithdrawFormSubmit = async (e: FormEvent) => {
  e.preventDefault();
  try {
    if (!wallet.publicKey) throw new Error("Wallet not connected");

    if (!withdrawIdentifier.trim()) {
      showToast("error", "Pool identifier is required.");
      return;
    }

    // Basic validation
    if (!wdValue.trim() || isNaN(Number(wdValue)) || Number(wdValue) <= 0) {
      showToast("error", "Withdraw value must be a positive number.");
      return;
    }
    if (!wdNullifier.trim()) {
      showToast("error", "Nullifier is required.");
      return;
    }

    if (withdrawMode === 1) {
      if (!wdAddAmount.trim() || isNaN(Number(wdAddAmount)) || Number(wdAddAmount) <= 0) {
        showToast("error", "Amount to add must be a positive number.");
        return;
      }
      if (!wdNewNull.trim()) {
        showToast("error", "New nullifier is required for mode 1.");
        return;
      }
    }

    setIsProcessingWithdrawForm(true);

    let sig: string;
    switch (withdrawMode) {
      case 0:
        // withdraw(connection, walletAdapter, identifier, value, nullifier)
        sig = await withdraw(
          connection,
          wallet,
          withdrawIdentifier,
          Number(wdValue),
          wdNullifier
        );
        showToast("success", `Withdraw tx: ${sig}`);
        break;

      case 1:
        // withdrawAndAdd(connection, walletAdapter, identifier, value, nullifier, amountToWithdraw, newNullifier)
        sig = await withdrawAndAdd(
          connection,
          wallet,
          withdrawIdentifier,
          Number(wdValue),
          wdNullifier,
          Number(wdAddAmount),
          wdNewNull
        );
        showToast("success", `Withdraw+Add tx: ${sig}`);
        break;
    }

    // Close & reset
    setShowWithdrawForm(false);
    setWithdrawIdentifier("");
    setWithdrawMode(0);
    setWdValue("");
    setWdNullifier("");
    setWdAddAmount("");
    setWdNewNull("");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    showToast("error", `Withdraw failed: ${msg}`);
    if (
      typeof err === "object" &&
      err !== null &&
      "logs" in err &&
      Array.isArray((err as { logs: unknown[] }).logs)
    ) {
      const maybeLogs = (err as { logs: unknown[] }).logs;
      console.groupCollapsed("❌ Withdraw error logs");
      maybeLogs.forEach((l) => {
        if (typeof l === "string") console.log(l);
      });
      console.groupEnd();
    }
  } finally {
    setIsProcessingWithdrawForm(false);
  }
};
const handleWithdrawIdentifierChange = (e: ChangeEvent<HTMLInputElement>) => {
  setWithdrawIdentifier(e.target.value);
};
const handleWithdrawModeChange = (e: ChangeEvent<HTMLSelectElement>) => {
  const m = Number(e.target.value);
  setWithdrawMode(m === 1 ? 1 : 0);
};
  
  // const handleWithdraw = async () => {
  //   try {
  //     if (!wallet.publicKey) throw new Error("Wallet not connected");
  //     const sig = await chooseWithdraw(connection, wallet, null);
  //     showToast("success", `Withdraw sent: ${sig}`);
  //   } catch (err: any) {
  //     const msg = err instanceof Error ? err.message : String(err);
  //     showToast("error", `Withdraw failed: ${msg}`);
  //     if (Array.isArray(err.logs)) {
  //       console.groupCollapsed("❌ Withdraw error logs");
  //       err.logs.forEach((l: string) => console.log(l));
  //       console.groupEnd();
  //     }
  //   }
  // };

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
                if (!isProcessingDeposit) {
                  setShowDepositForm(false);
                  // reset state if you want:
                  setDepositAmounts(["", ""]);
                  setDepositNulls(["", ""]);
                  setDepositCount(1);
                  setDepositIdentifier("");
                }
              }}
              className="absolute top-3 right-3 text-gray-400 hover:text-red-500"
              disabled={isProcessingDeposit}
            >
              ×
            </button>

            <h3 className="text-white text-lg font-semibold mb-4">
              Deposit
            </h3>

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
                  disabled={isProcessingDeposit}
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
                  disabled={isProcessingDeposit}
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
                  disabled={isProcessingDeposit}
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
                  disabled={isProcessingDeposit}
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
                    disabled={isProcessingDeposit}
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
                    disabled={isProcessingDeposit}
                  />
                </div>
              )}

              {/* Deposit button + spinner */}
              <div className="flex justify-end">
                <button
                  type="submit"
                  className={`relative px-6 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60`}
                  disabled={isProcessingDeposit}
                >
                  {isProcessingDeposit && (
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
            Transfer Button → toggles inline form
      ───────────────────────────────────────── */}
      <button
        onClick={() => setShowTransferForm((prev) => !prev)}
        className="w-full py-3 rounded-xl bg-gradient-to-r from-yellow-400 to-green-600 hover:from-yellow-500 hover:to-green-700 text-black font-semibold drop-shadow-lg"
      >
        Transfer
      </button>

      {showTransferForm && (
  <div
    className="
      fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center
      z-50
    "
  >
    <div className="relative w-[90vw] max-w-md bg-[#1f1f1f] border border-gray-700 rounded-xl p-6">
      {/* Close “×” button */}
      <button
        onClick={() => {
          if (!isProcessingTransfer) {
            setShowTransferForm(false);
            setTransferIdentifier("");
            setTransferMode(0);
            // Also reset any sub‐fields if desired
          }
        }}
        className="absolute top-3 right-3 text-gray-400 hover:text-red-500"
        disabled={isProcessingTransfer}
      >
        ×
      </button>

      <h3 className="text-white text-lg font-semibold mb-4">
        Transfer (Combine)
      </h3>

      <form onSubmit={handleTransferFormSubmit} className="space-y-4">
        {/* Pool Identifier */}
        <div>
          <label className="block text-gray-300 text-sm mb-1">
            Pool Identifier
          </label>
          <input
            type="text"
            value={transferIdentifier}
            onChange={handleTransferIdentifierChange}
            placeholder="Max 16 chars"
            maxLength={16}
            className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
            disabled={isProcessingTransfer}
          />
        </div>

        {/* Transfer Mode */}
        <div>
          <label className="block text-gray-300 text-sm mb-1">
            Combine Mode
          </label>
          <select
            value={transferMode}
            onChange={handleTransferModeChange}
            className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
            disabled={isProcessingTransfer}
          >
            <option value={0}>2 old‐leaves → 1 new‐leaf</option>
            <option value={1}>1 old‐leaf → 2 new‐leaves</option>
            <option value={2}>2 old‐leaves → 2 new‐leaves (prompt‐based)</option>
          </select>
        </div>

        {/* Mode 0: Combine 2→1 Inputs */}
        {transferMode === 0 && (
          <div className="space-y-4">
            {/* Value 1 */}
            <div>
              <label className="block text-gray-300 text-sm mb-1">
                Leaf 1 Value (lamports)
              </label>
              <input
                type="number"
                min="1"
                value={t2v1}
                onChange={(e) => setT2V1(e.target.value)}
                placeholder="e.g. 1000000"
                className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                disabled={isProcessingTransfer}
              />
            </div>

            {/* Nullifier 1 */}
            <div>
              <label className="block text-gray-300 text-sm mb-1">
                Leaf 1 Nullifier
              </label>
              <input
                type="text"
                value={t2n1}
                onChange={(e) => setT2N1(e.target.value)}
                placeholder="Unique nullifier string"
                className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                disabled={isProcessingTransfer}
              />
            </div>

            {/* Value 2 */}
            <div>
              <label className="block text-gray-300 text-sm mb-1">
                Leaf 2 Value (lamports)
              </label>
              <input
                type="number"
                min="1"
                value={t2v2}
                onChange={(e) => setT2V2(e.target.value)}
                placeholder="e.g. 2000000"
                className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                disabled={isProcessingTransfer}
              />
            </div>

            {/* Nullifier 2 */}
            <div>
              <label className="block text-gray-300 text-sm mb-1">
                Leaf 2 Nullifier
              </label>
              <input
                type="text"
                value={t2n2}
                onChange={(e) => setT2N2(e.target.value)}
                placeholder="Unique nullifier string"
                className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                disabled={isProcessingTransfer}
              />
            </div>

            {/* New Nullifier */}
            <div>
              <label className="block text-gray-300 text-sm mb-1">
                New Nullifier
              </label>
              <input
                type="text"
                value={t2newNull}
                onChange={(e) => setT2NewNull(e.target.value)}
                placeholder="Unique new nullifier"
                className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                disabled={isProcessingTransfer}
              />
            </div>
          </div>
        )}

        {/* Mode 1: Combine 1→2 Inputs */}
        {transferMode === 1 && (
          <div className="space-y-4">
            {/* Old‐Leaf Nullifier */}
            <div>
              <label className="block text-gray-300 text-sm mb-1">
                Old Leaf Nullifier
              </label>
              <input
                type="text"
                value={t1n1}
                onChange={(e) => setT1N1(e.target.value)}
                placeholder="Unique nullifier string"
                className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                disabled={isProcessingTransfer}
              />
            </div>

            {/* Old‐Leaf Value */}
            <div>
              <label className="block text-gray-300 text-sm mb-1">
                Old Leaf Value (lamports)
              </label>
              <input
                type="number"
                min="1"
                value={t1v1}
                onChange={(e) => setT1V1(e.target.value)}
                placeholder="e.g. 2000000"
                className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                disabled={isProcessingTransfer}
              />
            </div>

            {/* New Value 1 */}
            <div>
              <label className="block text-gray-300 text-sm mb-1">
                New Leaf 1 Value (lamports)
              </label>
              <input
                type="number"
                min="1"
                value={t1newVal1}
                onChange={(e) => setT1NewVal1(e.target.value)}
                placeholder="e.g. 1000000"
                className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                disabled={isProcessingTransfer}
              />
              {/* Show computed newVal2 to user (not an input) */}
              {t1v1 && t1newVal1 && !isNaN(Number(t1v1)) && !isNaN(Number(t1newVal1)) && (
                <p className="text-gray-400 text-xs mt-1">
                  New Leaf 2 Value will be: {Number(t1v1) - Number(t1newVal1)} lamports
                </p>
              )}
            </div>

            {/* New Nullifier 1 */}
            <div>
              <label className="block text-gray-300 text-sm mb-1">
                New Leaf 1 Nullifier
              </label>
              <input
                type="text"
                value={t1newNull1}
                onChange={(e) => setT1NewNull1(e.target.value)}
                placeholder="Unique nullifier string"
                className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                disabled={isProcessingTransfer}
              />
            </div>

            {/* New Nullifier 2 */}
            <div>
              <label className="block text-gray-300 text-sm mb-1">
                New Leaf 2 Nullifier
              </label>
              <input
                type="text"
                value={t1newNull2}
                onChange={(e) => setT1NewNull2(e.target.value)}
                placeholder="Unique nullifier string"
                className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                disabled={isProcessingTransfer}
              />
            </div>
          </div>
        )}

        {/* Mode 2 (prompt-based) has no additional fields */}

        {/* Submit Button + Spinner */}
        <div className="flex justify-end">
          <button
            type="submit"
            className={`relative px-6 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-60`}
            disabled={isProcessingTransfer}
          >
            {isProcessingTransfer && (
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2">
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
            Transfer
          </button>
        </div>
      </form>
    </div>
  </div>
)}

      {/*
  Add this button somewhere alongside Deposit/Transfer buttons:
*/}
<button
  onClick={() => setShowWithdrawForm((prev) => !prev)}
  className="w-full py-3 rounded-xl bg-gradient-to-r from-green-400 to-lime-600 hover:from-green-500 hover:to-lime-700 text-black font-semibold drop-shadow-lg"
>
  Withdraw
</button>

{showWithdrawForm && (
  <div
    className="
      fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center
      z-50
    "
  >
    <div className="relative w-[90vw] max-w-md bg-[#1f1f1f] border border-gray-700 rounded-xl p-6">
      {/* Close “×” button */}
      <button
        onClick={() => {
          if (!isProcessingWithdrawForm) {
            setShowWithdrawForm(false);
            setWithdrawIdentifier("");
            setWithdrawMode(0);
            setWdValue("");
            setWdNullifier("");
            setWdAddAmount("");
            setWdNewNull("");
          }
        }}
        className="absolute top-3 right-3 text-gray-400 hover:text-red-500"
        disabled={isProcessingWithdrawForm}
      >
        ×
      </button>

      <h3 className="text-white text-lg font-semibold mb-4">
        Withdraw
      </h3>

      <form onSubmit={handleWithdrawFormSubmit} className="space-y-4">
        {/* Pool Identifier */}
        <div>
          <label className="block text-gray-300 text-sm mb-1">
            Pool Identifier
          </label>
          <input
            type="text"
            value={withdrawIdentifier}
            onChange={handleWithdrawIdentifierChange}
            placeholder="Max 16 chars"
            maxLength={16}
            className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            disabled={isProcessingWithdrawForm}
          />
        </div>

        {/* Withdraw Mode */}
        <div>
          <label className="block text-gray-300 text-sm mb-1">
            Withdraw Mode
          </label>
          <select
            value={withdrawMode}
            onChange={handleWithdrawModeChange}
            className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            disabled={isProcessingWithdrawForm}
          >
            <option value={0}>Simple Withdraw</option>
            <option value={1}>Withdraw &amp; Add Leaf</option>
          </select>
        </div>

        {/* Common: Value to Withdraw */}
        <div>
          <label className="block text-gray-300 text-sm mb-1">
            Withdraw Value (lamports)
          </label>
          <input
            type="number"
            min="1"
            value={wdValue}
            onChange={(e) => setWdValue(e.target.value)}
            placeholder="e.g. 1000000"
            className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            disabled={isProcessingWithdrawForm}
          />
        </div>

        {/* Common: Nullifier */}
        <div>
          <label className="block text-gray-300 text-sm mb-1">
            Nullifier
          </label>
          <input
            type="text"
            value={wdNullifier}
            onChange={(e) => setWdNullifier(e.target.value)}
            placeholder="Unique nullifier string"
            className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            disabled={isProcessingWithdrawForm}
          />
        </div>

        {/* Mode 1: Withdraw & Add Leaf */}
        {withdrawMode === 1 && (
          <div className="space-y-4">
            {/* Amount to Add */}
            <div>
              <label className="block text-gray-300 text-sm mb-1">
                Amount to Add (lamports)
              </label>
              <input
                type="number"
                min="1"
                value={wdAddAmount}
                onChange={(e) => setWdAddAmount(e.target.value)}
                placeholder="e.g. 500000"
                className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                disabled={isProcessingWithdrawForm}
              />
            </div>

            {/* New Nullifier */}
            <div>
              <label className="block text-gray-300 text-sm mb-1">
                New Leaf Nullifier
              </label>
              <input
                type="text"
                value={wdNewNull}
                onChange={(e) => setWdNewNull(e.target.value)}
                placeholder="Unique new nullifier"
                className="w-full px-3 py-2 bg-[#222] border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                disabled={isProcessingWithdrawForm}
              />
            </div>
          </div>
        )}

        {/* Submit Button + Spinner */}
        <div className="flex justify-end">
          <button
            type="submit"
            className={`relative px-6 py-2 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-60`}
            disabled={isProcessingWithdrawForm}
          >
            {isProcessingWithdrawForm && (
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2">
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
            Withdraw
          </button>
        </div>
      </form>
    </div>
  </div>
)}


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
