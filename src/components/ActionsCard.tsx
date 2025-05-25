// src/components/ActionsCard.tsx
"use client";
import React from "react";

type Props = {
  onDeposit(): void;
  onTransfer(): void;
  onWithdraw(): void;
};

export function ActionsCard({ onDeposit, onTransfer, onWithdraw }: Props) {
    return (
      <div className="bg-[#111] border border-gray-800 rounded-2xl p-6 flex flex-col gap-4 shadow-lg">
        <div className="text-gray-400 uppercase tracking-wide">Actions</div>
  
        <button
          onClick={onDeposit}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 hover:from-cyan-500 hover:to-blue-700 text-black font-semibold drop-shadow-lg"
        >
          Deposit
        </button>
  
        <button
          onClick={onTransfer}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-neon-yellow to-orange-500 hover:from-neon-yellow hover:to-orange-600 text-white font-semibold drop-shadow-lg"
        >
          Transfer
        </button>
  
        <button
          onClick={onWithdraw}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-green-400 to-lime-600 hover:from-green-500 hover:to-lime-700 text-black font-semibold drop-shadow-lg"
        >
          Withdraw
        </button>
      </div>
    );
  }