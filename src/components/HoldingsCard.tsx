"use client";

import React, { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getBalance } from "../lib/utils.js";

export function HoldingsCard() {
  const { publicKey, connected } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      setBalance(null);
      return;
    }
    // fetch balance whenever wallet connects or changes
    getBalance(publicKey.toBase58()).then(setBalance);
  }, [connected, publicKey]);

  return (
    <div className="bg-gray-800 rounded-2xl p-6 flex-1">
      <h2 className="text-xl font-semibold text-white mb-4">
        Your Holdings
      </h2>
      {connected ? (
        balance === null ? (
          <div className="text-white">Loading…</div>
        ) : (
          <div className="text-4xl font-bold text-white">
            {balance.toFixed(4)} SOL
          </div>
        )
      ) : (
        <div className="text-gray-400">Connect your wallet</div>
      )}
    </div>
  );
}
