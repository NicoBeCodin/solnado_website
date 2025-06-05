// src/components/ActionsCard.tsx
"use client";

import React, { useState, ChangeEvent, FormEvent, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { initializeVariablePool } from "../lib/pool.js";
import {
  depositRepeatedly,
  depositVariable,
} from "../lib/deposit.js";
// Import the individual transfer functions
import {
  transferCombine2to1,
  transferCombine1to2, 
} from "../lib/transfer.js";
import { withdraw, withdrawAndAdd } from "../lib/withdraw.js";
import { loadNotes, saveNotes, generateNullifier } from "@/lib/noteStorage.js";
import { getPoseidonBytes, to32 } from "@/lib/utils.js";
import { poseidon1 } from "poseidon-lite";

type Toast = {
  type: "success" | "error";
  message: string;
};
interface Note {
  id: string;
  amount: number;
  nullifier: string;
  timestamp: number;
  poolId: string;
  nullifierHash: string;
}

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
  const [withdrawingNote, setWithdrawingNote] = useState<{
    id: string;
    amount: number;
    nullifier: string;
    timestamp: number;
    nullifierHash: string;
    poolId: string;
  } | null>(null);

  const [withdrawIdentifier, setWithdrawIdentifier] = useState("");
  const [withdrawMode, setWithdrawMode] = useState<0 | 1>(0);
  const [wdValue, setWdValue] = useState<string>("");           // value to withdraw
  const [wdNullifier, setWdNullifier] = useState<string>("");   // nullifier for withdraw
  const [wdAddAmount, setWdAddAmount] = useState<string>("");   // amount to add if mode 1
  const [wdNewNull, setWdNewNull] = useState<string>("");       // new nullifier if mode 1
  const [isProcessingWithdrawForm, setIsProcessingWithdrawForm] = useState(false);

  // Dev‐Options section toggle
  const [showDevOptions, setShowDevOptions] = useState(false);

  const [notes, setNotes] = useState<
    Array<{
      id: string;
      amount: number;
      nullifier: string;
      timestamp: number;
      nullifierHash: string,
      poolId: string,
    }>
  >([]);

  // Keep “selectedLeaves” in ActionsCard in sync with whatever HoldingsCard broadcasts:
  const [selectedLeaves, setSelectedLeaves] = useState<
    Array<{
      id: string;
      amount: number;
      nullifier: string;
      timestamp: number;
      nullifierHash: string;
      poolId: string;
    }>
  >([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<typeof selectedLeaves>;
      setSelectedLeaves(ce.detail);
    };
    window.addEventListener("selectedNotesChanged", handler);
    return () => {
      window.removeEventListener("selectedNotesChanged", handler);
    };
  }, []);


  // ─────────────────────────────────────────────────────────────
  // Whenever someone dispatches "openTransferForm", open our modal:
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setShowTransferForm(true);
    window.addEventListener("openTransferForm", handler);
    return () => {
      window.removeEventListener("openTransferForm", handler);
    };
  }, []);


  useEffect(() => {
    if (!showTransferForm) return;

    // (a) Always generate brand‐new nullifiers for the *new* leaf(s):
    setT2NewNull(generateNullifier());
    setT1NewNull1(generateNullifier());
    setT1NewNull2(generateNullifier());
    if (selectedLeaves.length > 0) {
      setTransferIdentifier(selectedLeaves[0].poolId);

    }

    // (b) If exactly two notes are selected, prefill the Combine 2→1 fields:
    if (selectedLeaves.length === 2) {
      const [leafA, leafB] = selectedLeaves;
      setT2V1(leafA.amount.toString());
      setT2N1(leafA.nullifier);
      setT2V2(leafB.amount.toString());
      setT2N2(leafB.nullifier);
      setTransferMode(0);
      if (leafA.poolId != leafB.poolId) {
        alert("Mismatch in poolId between two leaves");
        return;
      }
      return;
    }

    // (c) If exactly one note is selected, prefill the Split 1→2 fields:
    if (selectedLeaves.length === 1) {
      const [leaf] = selectedLeaves;
      setT1V1(leaf.amount.toString());
      setT1N1(leaf.nullifier);
      setTransferMode(1);
      return;
    }

    // (d) If none or >2, just default to mode 0 with fresh nullifiers:
    setTransferMode(0);
  }, [showTransferForm, selectedLeaves]);


  const pubKey = wallet.publicKey?.toBase58() || "";
  useEffect(() => {
    if (!pubKey) {
      setNotes([]);
      return;
    }
    loadNotes(pubKey).then(setNotes);
  }, [pubKey]);

  // Whenever the Deposit dialog opens (or depositCount changes), prefill each null‐field with a random nullifier:
  useEffect(() => {
    if (showDepositForm) {
      // fill depositNulls[0…depositCount-1] with new random strings
      const prefill: string[] = [];
      for (let i = 0; i < depositCount; i++) {
        prefill[i] = generateNullifier();
      }
      setDepositNulls(prefill);
    }
  }, [showDepositForm, depositCount]);


  // Toast helper
  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 10000);
  };

useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{
        id: string;
        amount: number;
        nullifier: string;
        timestamp: number;
        nullifierHash: string;
        poolId: string;
      }>;
      const note = ce.detail;

      // 1) Open the Withdraw dialog:
      setShowWithdrawForm(true);

      // 2) Remember which note we’re withdrawing:
      setWithdrawingNote(note);

      // 3) Autofill the form fields:
      setWdValue(note.amount.toString());       // Withdraw amount = note.amount
      setWdNullifier(note.nullifier);           // Nullifier = note.nullifier
      setWithdrawIdentifier(note.poolId);       // Pool identifier = note.poolId

      // 4) Generate a fresh “new leaf” nullifier (if in “Withdraw & Add” mode):
      setWdNewNull(generateNullifier());
    };

    window.addEventListener("openWithdrawForm", handler);
    return () => {
      window.removeEventListener("openWithdrawForm", handler);
    };
  }, []);



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

      // Reset Note related form state, if needed
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
      if (!depositIdentifier.trim()) {
        showToast("error", "Pool identifier is required.");
        return;
      }

      // 1) Build arrays for lamports & nullifiers
      const values: number[] = [];
      const nulls: string[] = [];
      for (let i = 0; i < depositCount; i++) {
        const solAmt = Number(depositAmounts[i]?.trim());
        const nullifier = depositNulls[i]?.trim() || generateNullifier();
        if (!solAmt || isNaN(solAmt) || solAmt <= 0) {
          showToast("error", `Invalid amount for leaf ${i + 1}.`);
          return;
        }
        values.push(Math.floor(solAmt * 1_000_000_000));
        nulls.push(nullifier);
      }

      // 2) Call on‐chain deposit
      setIsProcessingDeposit(true);
      const sig = await depositVariable(
        connection,
        wallet,
        depositIdentifier.trim(),
        values,
        nulls
      );
      showToast("success", `Deposit sent: ${sig}`);

      // 3) ONLY now update local wallet state (notes)
      //    Start from the current `notes` array, not inside the loop
      const updatedNotes = [...notes];
      for (let i = 0; i < depositCount; i++) {
        const solAmt = Number(depositAmounts[i].trim());
        const nullifier = nulls[i];
        updatedNotes.push({
          id: getPoseidonBytes(solAmt, nullifier, 0).toString("hex"),
          amount: parseFloat(solAmt.toFixed(4)),
          nullifier,
          timestamp: Date.now(),
          nullifierHash: "",
          poolId: depositIdentifier
        });
      }
      setNotes(updatedNotes);
      await saveNotes(pubKey, updatedNotes);
      window.dispatchEvent(new Event("notesChanged"));
      // 4) Reset form
      setShowDepositForm(false);
      setDepositIdentifier("");
      setDepositAmounts(["", ""]);
      setDepositNulls(["", ""]);
      setDepositCount(1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("error", `Deposit failed: ${msg}`);
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

      // (1) Validate your fields exactly as you already do…
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
      }
      // (… handle transferMode === 1 similarly …)

      setIsProcessingTransfer(true);

      let sig: string;
      switch (transferMode) {
        case 0:
          // ── COMBINE 2→1 ON-CHAIN CALL ─────────────────────────────────────────
          sig = await transferCombine2to1(
            connection,
            wallet,
            transferIdentifier,
            // convert SOL→lamports:
            Number(t2v1) * 1_000_000_000,
            t2n1,
            Number(t2v2) * 1_000_000_000,
            t2n2,
            t2newNull
          );
          showToast("success", `Combine 2→1 tx: ${sig}`);

          // ── NOW UPDATE LOCAL NOTES STORAGE ──────────────────────────────────
          {
            // (a) Reload the *entire* stored array so we don’t accidentally overwrite
            //     everything with just these two:
            const rawNotes = await loadNotes(pubKey);
            // (b) “Normalize” each note to guarantee it has a nullifierHash field:
            const allNotes = rawNotes.map((n: Note) => ({
              id: String(n.id),
              amount: n.amount,
              nullifier: n.nullifier,
              timestamp: n.timestamp,
              poolId: n.poolId,
              // If it already has a nullifierHash, preserve it; otherwise, start as “”
              nullifierHash: n.nullifierHash || "",
            }));

            // (c) Compute the 32-byte Poseidon hash of each old leaf’s nullifier:
            //     We know the two old leaves are exactly identified by t2n1 and t2n2.
            //     (Assumes you used the string nullifier as the “n1” and “n2” keys originally.)
            const rawBig1 = BigInt("0x" + Buffer.from(t2n1).toString("hex"));
            const hashBuf1 = to32(poseidon1([rawBig1]));
            const hexHash1 = hashBuf1.toString("hex");
            const rawBig2 = BigInt("0x" + Buffer.from(t2n2).toString("hex"));
            const hashBuf2 = to32(poseidon1([rawBig2]));
            const hexHash2 = hashBuf2.toString("hex");

            // (d) Mark those two notes as spent (nullifierHash ≠ "")
            const updated = allNotes.map((note: Note) => {
              if (note.nullifier === t2n1) {
                return { ...note, nullifierHash: hexHash1 };
              }
              if (note.nullifier === t2n2) {
                return { ...note, nullifierHash: hexHash2 };
              }
              return note;
            });

            // (e) Create the new “combined” leaf object and append it:
            //     The “id” is whatever getPoseidonBytes(...) hex you already used in HoldingsCard,
            //     amount is Number(t2v1)+Number(t2v2), and its nullifier = t2newNull.
            const combinedAmount = parseFloat(
              (Number(t2v1) + Number(t2v2)).toFixed(4)
            );
            const combinedId = getPoseidonBytes(combinedAmount, t2newNull, 0).toString("hex");
            const newNote = {
              id: combinedId,
              amount: combinedAmount,
              nullifier: t2newNull,
              timestamp: Date.now(),
              nullifierHash: "", // brand-new leaf → not spent yet
              poolId: transferIdentifier,
            };
            updated.push(newNote);

            // (f) Write that full array back to localStorage and fire “notesChanged”:
            setNotes(updated);
            await saveNotes(pubKey, updated);
            window.dispatchEvent(new Event("notesChanged"));
          }
          break;

        case 1:
          // ── (a) Do the on-chain 1→2 call ──────────────────────────────────────────
          const oldLamports = Math.floor(Number(t1v1) * 1e9);
          const newLamports1 = Math.floor(Number(t1newVal1) * 1e9);
          sig = await transferCombine1to2(
            connection,
            wallet,
            transferIdentifier,
            t1n1,           // old-leaf nullifier
            oldLamports,
            newLamports1,   // “new leaf #1” lamports
            t1newNull1,     // new leaf 1 nullifier
            t1newNull2      // new leaf 2 nullifier
          );
          showToast("success", `Combine 1→2 tx: ${sig}`);

          // ── (b) Now rebuild local notes exactly as you do for “2→1” ─────────────
          {
            const rawNotes = await loadNotes(pubKey);
            const allNotes = rawNotes.map((n: Note) => ({
              id: String(n.id),
              amount: n.amount,
              nullifier: n.nullifier,
              timestamp: n.timestamp,
              poolId: n.poolId,
              nullifierHash: n.nullifierHash || "",
            }));

            // mark the old leaf as spent:
            const spentBig = BigInt("0x" + Buffer.from(t1n1).toString("hex"));
            const spentHashBuf = to32(poseidon1([spentBig]));
            const spentHex = spentHashBuf.toString("hex");

            const updated = allNotes.map((note: Note) =>
              note.nullifier === t1n1
                ? { ...note, nullifierHash: spentHex }
                : note
            );

            // compute “new leaf #2” amount in SOL:
            const oldAmountSOL = Number(t1v1);
            const newAmount1SOL = Number(t1newVal1);
            const newAmount2SOL = +(oldAmountSOL - newAmount1SOL).toFixed(4);

            // build the two new leaves:
            const newId1 = getPoseidonBytes(newAmount1SOL, t1newNull1, 0).toString("hex");
            const newId2 = getPoseidonBytes(newAmount2SOL, t1newNull2, 0).toString("hex");

            updated.push({
              id: newId1,
              amount: newAmount1SOL,
              nullifier: t1newNull1,
              timestamp: Date.now(),
              nullifierHash: "",
              poolId: transferIdentifier,
            });
            updated.push({
              id: newId2,
              amount: newAmount2SOL,
              nullifier: t1newNull2,
              timestamp: Date.now(),
              nullifierHash: "",
              poolId: transferIdentifier,
            });

            setNotes(updated);
            await saveNotes(pubKey, updated);
            window.dispatchEvent(new Event("notesChanged"));
          }
          break;
      }

      // Finally, close/reset your modal fields here…
      setShowTransferForm(false);
      setTransferIdentifier("");
      setTransferMode(0);
      setT2V1("");
      setT2V2("");
      setT2N1("");
      setT2N2("");
      setT2NewNull("");
      setT1N1("");
      setT1V1("");
      setT1NewVal1("");
      setT1NewNull1("");
      setT1NewNull2("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("error", `Transfer failed: ${msg}`);
      console.error(err);
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
      if (!wdValue.trim() || isNaN(Number(wdValue)) || Number(wdValue) <= 0) {
        showToast("error", "Withdraw value must be a positive number.");
        return;
      }
      if (!wdNullifier.trim()) {
        showToast("error", "Nullifier is required.");
        return;
      }
      // If mode 1, ensure “amount to add” is valid
      if (
        withdrawMode === 1 &&
        (!wdAddAmount.trim() ||
          isNaN(Number(wdAddAmount)) ||
          Number(wdAddAmount) <= 0)
      ) {
        showToast("error", "Amount to add must be a positive number.");
        return;
      }

      setIsProcessingWithdrawForm(true);
      const pubKey = wallet.publicKey.toBase58();
      // Convert SOL→lamports
      const lamportsToWithdraw = Math.floor(Number(wdValue) * 1e9);

      let sig: string;

      if (withdrawMode === 0) {
        // ── MODE 0: simple withdraw ─────────────────────────────────────────────
        sig = await withdraw(
          connection,
          wallet,
          withdrawIdentifier,
          lamportsToWithdraw,
          wdNullifier
        );
        showToast("success", `Withdraw tx: ${sig}`);

        // ── Update local notes: mark the old leaf spent ────────────────────────
        if (withdrawingNote) {
          const freshest = await loadNotes(pubKey);
          const normalized = freshest.map((n: Note) => ({
            id: String(n.id),
            amount: n.amount,
            nullifier: n.nullifier,
            timestamp: n.timestamp,
            poolId: n.poolId,
            nullifierHash: n.nullifierHash || "",
          }));
          const rawBig = BigInt(
            "0x" + Buffer.from(withdrawingNote.nullifier).toString("hex")
          );
          const spentHashBuf = to32(poseidon1([rawBig]));
          const spentHex = spentHashBuf.toString("hex");

          const updatedNotes = normalized.map((n: Note) =>
            n.id === withdrawingNote.id
              ? { ...n, nullifierHash: spentHex }
              : n
          );
          setNotes(updatedNotes);
          await saveNotes(pubKey, updatedNotes);
          window.dispatchEvent(new Event("notesChanged"));
        }
      } else {
        // ── MODE 1: withdrawAndAdd ──────────────────────────────────────────────
        const lamportsToAdd = Math.floor(Number(wdAddAmount) * 1e9);
        sig = await withdrawAndAdd(
          connection,
          wallet,
          withdrawIdentifier,
          lamportsToWithdraw,
          wdNullifier,
          lamportsToAdd,
          wdNewNull
        );
        showToast("success", `Withdraw+Add tx: ${sig}`);

        // ── Update local notes: mark the old leaf spent & append new leaf ─────
        if (withdrawingNote) {
          const freshest = await loadNotes(pubKey);
          const normalized = freshest.map((n: Note) => ({
            id: String(n.id),
            amount: n.amount,
            nullifier: n.nullifier,
            timestamp: n.timestamp,
            poolId: n.poolId,
            nullifierHash: n.nullifierHash || "",
          }));

          // Mark old leaf as spent
          const rawBigOld = BigInt(
            "0x" + Buffer.from(withdrawingNote.nullifier).toString("hex")
          );
          const spentHashBufOld = to32(poseidon1([rawBigOld]));
          const spentHexOld = spentHashBufOld.toString("hex");

          const updated = normalized.map((n: Note) =>
            n.id === withdrawingNote.id
              ? { ...n, nullifierHash: spentHexOld }
              : n
          );

          // Append the new UTXO
          const addedAmountSOL = parseFloat(Number(wdAddAmount).toFixed(4));
          const newNoteId = getPoseidonBytes(
            addedAmountSOL,
            wdNewNull,
            0
          ).toString("hex");
          updated.push({
            id: newNoteId,
            amount: addedAmountSOL,
            nullifier: wdNewNull,
            timestamp: Date.now(),
            nullifierHash: "",
            poolId: withdrawIdentifier,
          });

          setNotes(updated);
          await saveNotes(pubKey, updated);
          window.dispatchEvent(new Event("notesChanged"));
        }
      }

      // ── Close & reset form ─────────────────────────────────────────────────
      setShowWithdrawForm(false);
      setWithdrawIdentifier("");
      setWdValue("");
      setWdNullifier("");
      setWdAddAmount("");
      setWdNewNull("");
      setWithdrawingNote(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast("error", `Withdraw failed: ${msg}`);
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
                  Leaf 1 Amount (SOL)
                </label>
                <input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={depositAmounts[0]}
                  onChange={(e) => handleAmountChange(0, e)}
                  placeholder="e.g. 0.5"
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
                    min="0.0001"
                    step="0.0001"
                    value={depositAmounts[1]}
                    onChange={(e) => handleAmountChange(1, e)}
                    placeholder="e.g. 0.02"
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
                  // Also reset Note sub‐fields if desired
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
                  {/* Old‐Leaf #1 Value */}
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">
                      Leaf 1 Value (SOL)
                    </label>
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={t2v1}
                      onChange={(e) => setT2V1(e.target.value)}
                      className="w-full px-3 py-2 bg-[#222] border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      disabled={isProcessingTransfer}
                    />
                  </div>
                  {/* Old‐Leaf #1 Nullifier */}
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">
                      Leaf 1 Nullifier
                    </label>
                    <input
                      type="text"
                      value={t2n1}
                      onChange={(e) => setT2N1(e.target.value)}
                      className="w-full px-3 py-2 bg-[#222] border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      disabled={isProcessingTransfer}
                    />
                  </div>
                  {/* Old‐Leaf #2 Value */}
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">
                      Leaf 2 Value (SOL)
                    </label>
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={t2v2}
                      onChange={(e) => setT2V2(e.target.value)}
                      className="w-full px-3 py-2 bg-[#222] border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      disabled={isProcessingTransfer}
                    />
                  </div>
                  {/* Old‐Leaf #2 Nullifier */}
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">
                      Leaf 2 Nullifier
                    </label>
                    <input
                      type="text"
                      value={t2n2}
                      onChange={(e) => setT2N2(e.target.value)}
                      className="w-full px-3 py-2 bg-[#222] border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
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
                      className="w-full px-3 py-2 bg-[#222] border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      disabled={isProcessingTransfer}
                    />
                  </div>
                </div>
              )}
              {t2v1 && t2v2 && !isNaN(Number(t2v1)) && !isNaN(Number(t2v2)) && (
                <p className="text-gray-400 text-sm">
                  New Leaf Value: {(Number(t2v1) + Number(t2v2)).toFixed(4)} SOL
                </p>
              )}

              {/* Mode 1: Combine 1→2 Inputs */}
              {transferMode === 1 && (
                <div className="space-y-4">
                  {/* Old Leaf Nullifier */}
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">
                      Old Leaf Nullifier
                    </label>
                    <input
                      type="text"
                      value={t1n1}
                      onChange={(e) => setT1N1(e.target.value)}
                      className="w-full px-3 py-2 bg-[#222] border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      disabled={isProcessingTransfer}
                    />
                  </div>
                  {/* Old Leaf Value */}
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">
                      Old Leaf Value (SOL)
                    </label>
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={t1v1}
                      onChange={(e) => setT1V1(e.target.value)}
                      className="w-full px-3 py-2 bg-[#222] border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      disabled={isProcessingTransfer}
                    />
                  </div>
                  {/* New Leaf 1 Value */}
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">
                      New Leaf 1 Value (SOL)
                    </label>
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={t1newVal1}
                      onChange={(e) => setT1NewVal1(e.target.value)}
                      className="w-full px-3 py-2 bg-[#222] border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      disabled={isProcessingTransfer}
                    />
                    {t1v1 && t1newVal1 && !isNaN(Number(t1v1)) && !isNaN(Number(t1newVal1)) && (
                      <p className="text-gray-400 text-xs mt-1">
                        New Leaf 2 Value will be: {Number(t1v1) - Number(t1newVal1)} SOL
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
                      className="w-full px-3 py-2 bg-[#222] border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
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
                      className="w-full px-3 py-2 bg-[#222] border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                      disabled={isProcessingTransfer}
                    />
                  </div>
                </div>
              )}

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
      {/* “Withdraw” button: only opens if exactly one note is selected */}
      <button
        onClick={() => {
          if (selectedLeaves.length === 1) {
            // dispatch event containing that single leaf’s data:
            window.dispatchEvent(
              new CustomEvent("openWithdrawForm", { detail: selectedLeaves[0] })
            );
          } else {
            // optional: show a toast/error if none or >1 selected
            showToast("error", "Select exactly one note to withdraw.");
          }
        }}
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
                  Withdraw Value (SOL)
                </label>
                <input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={wdValue}
                  onChange={(e) => setWdValue(e.target.value)}
                  placeholder="e.g. 0.5"
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
                      Amount to withdraw (SOL)
                    </label>
                    <input
                      type="number"
                      min="0.0001"
                      value={wdAddAmount}
                      onChange={(e) => setWdAddAmount(e.target.value)}
                      placeholder="e.g. 0.5"
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
          {/* ───── Clear All Notes ───── */}
          <button
            onClick={() => {
              if (!pubKey) {
                showToast("error", "Wallet not connected.");
                return;
              }
              // Ask for confirmation
              if (
                window.confirm(
                  "⚠️ Warning: this will permanently erase all shielded notes from local storage for your wallet.\n\nAre you absolutely sure?"
                )
              ) {
                // Remove the storage key and clear state
                localStorage.removeItem("shieldedNotesEncrypted_" + pubKey);
                setNotes([]);
                // Notify other components (e.g. HoldingsCard) to reload:
                window.dispatchEvent(new Event("notesChanged"));
                showToast("success", "All notes cleared from browser storage.");
              }
            }}
            className="w-full py-2 rounded-lg bg-red-800 text-white font-semibold hover:bg-red-900 drop-shadow-md"
          >
            Clear All Notes (Dev)
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
