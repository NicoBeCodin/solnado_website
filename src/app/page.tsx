// src/app/page.tsx
"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import React from "react";
import { HoldingsCard } from "../components/HoldingsCard";
import { ActionsCard } from "../components/ActionsCard";

const Navbar = dynamic(
  () => import("../components/Navbar").then((mod) => mod.Navbar),
  { ssr: false }
);

export default function Page() {
  return (
    <>
      <Navbar />

      <main className="min-h-screen px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Logo + title */}
          <div className="flex items-center space-x-4">
            <Image
              src="/logo_thunder.png"
              alt="Solnado Logo"
              width={80}
              height={80}
              className="block"
            />
            <h2 className="text-4xl font-bold text-white">Solnado</h2>
          </div>

          <p className="text-xl text-gray-300">
            Completely anonymous, fast and cheap transfers. Powered by ZK on solana.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <HoldingsCard />
            <ActionsCard
              onDeposit={() => alert("Deposit")}
              onTransfer={() => alert("Transfer")}
              onWithdraw={() => alert("Withdraw")}
            />
          </div>
        </div>
      </main>
    </>
  );
}
