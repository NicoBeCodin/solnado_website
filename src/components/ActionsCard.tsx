"use client";
import React from "react";

export interface ActionsCardProps {
  onDeposit: () => void;
  onTransfer: () => void;
  onWithdraw: () => void;
}

export const ActionsCard: React.FC<ActionsCardProps> = ({
  onDeposit,
  onTransfer,
  onWithdraw,
}) => {
  return (
    <div className="bg-gray-800 rounded-2xl p-6 flex-1 flex flex-col">
      <h2 className="text-xl font-semibold text-white mb-6">
        Actions
      </h2>

      <button
        onClick={onDeposit}
        className="mb-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2 rounded-lg"
      >
        Deposit
      </button>

      <button
        onClick={onTransfer}
        className="mb-4 bg-yellow-600 hover:bg-yellow-500 text-white font-medium py-2 rounded-lg"
      >
        Transfer
      </button>

      <button
        onClick={onWithdraw}
        className="bg-red-600 hover:bg-red-500 text-white font-medium py-2 rounded-lg"
      >
        Withdraw
      </button>
    </div>
  );
};
