"use client";
import React from "react"
import { HoldingsCard } from "../components/HoldingsCard";
import { ActionsCard } from "../components/ActionsCard";
import { Navbar } from "@/components/Navbar";

export default function Page() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-gray-900 p-8">
        <h1 className="mb-8 text-3xl font-bold text-white">
          Anonymous fast and cheap transfers.
        </h1>
        <div className="flex flex-col md:flex-row gap-6">
          <HoldingsCard />
          <ActionsCard
            onDeposit={() => alert("deposit")}
            onTransfer={() => alert("transfer")}
            onWithdraw={() => alert("withdraw")}
          />
        </div>
      </main>
    </>
  );
}