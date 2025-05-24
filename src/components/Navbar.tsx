// src/components/Navbar.tsx
"use client";
import React from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function Navbar() {
  return (
    <nav className="bg-gray-800 p-4 flex justify-between items-center">
      <div className="text-white font-bold text-lg">Merkle ZK App</div>
      <WalletMultiButton className="bg-indigo-600 hover:bg-indigo-500 text-white" />
    </nav>
  );
}
