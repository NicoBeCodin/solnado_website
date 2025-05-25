"use client";
import React, { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getBalance } from "../lib/utils.js";

export function HoldingsCard() {
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) return setBalance(null);
    getBalance(publicKey.toBase58()).then(setBalance);
  }, [publicKey]);

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col justify-between shadow-xl">
      <div className="text-lg font-medium text-gray-400 mb-2">Your Holdings</div>
      <div className="text-5xl font-bold text-white">
        {balance != null ? balance.toFixed(4) : "--"} SOL
      </div>
    </div>
  );
}