// src/components/HoldingsCard.tsx
"use client";

import React, { useEffect, useState, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { getBalance, } from "../lib/utils.js";
import { loadNotes,  } from "../lib/noteStorage";


interface Note {
  id: string;
  amount: number;
  nullifier: string;
  timestamp: number;
  poolId: string;
  nullifierHash: string;
}

export function HoldingsCard() {
  const { publicKey } = useWallet();
  const [balance, setBalance] = useState<number | null>(null);
  const [notes, setNotes] = useState<
    Array<{
      id: string;
      amount: number;
      nullifier: string;
      timestamp: number;
      nullifierHash: string;
      poolId: string;
    }>
  >([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isLoadingNotes, setIsLoadingNotes] = useState(false);

  // UI state
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"active" | "spent">("active");
  const [showMenu, setShowMenu] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fetch SOL balance
  useEffect(() => {
    if (!publicKey) {
      setBalance(null);
      return;
    }
    getBalance(publicKey.toBase58()).then(setBalance);
  }, [publicKey]);

  // Load notes from local storage
  useEffect(() => {
    if (!publicKey) {
      setNotes([]);
      return;
    }
    const key = publicKey.toBase58();
    const reload = () => {
      setIsLoadingNotes(true);
      loadNotes(key)
        .then((loaded) => {
          const normalized = loaded.map((n: Note) => ({
            id: String(n.id),
            amount: n.amount,
            nullifier: n.nullifier,
            timestamp: n.timestamp,
            poolId: n.poolId,
            nullifierHash: n.nullifierHash || "",
          }));
          setNotes(normalized);
        })
        .finally(() => setIsLoadingNotes(false));
    };
    reload();
    window.addEventListener("notesChanged", reload);
    return () => window.removeEventListener("notesChanged", reload);
  }, [publicKey]);

  // Unselect any note that becomes spent
  useEffect(() => {
    setSelectedIds((prev) =>
      prev.filter((id) =>
        notes.some((n) => n.id === id && n.nullifierHash === "")
      )
    );
  }, [notes]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle row click
  const handleRowClick = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Broadcast selected notes to ActionsCard
  useEffect(() => {
    const chosen = notes.filter((n) => selectedIds.includes(n.id));
    window.dispatchEvent(
      new CustomEvent("selectedNotesChanged", { detail: chosen })
    );
  }, [selectedIds, notes]);

  // Calculate filtered lists
  const activeNotes = notes.filter((n) => n.nullifierHash === "");
  const spentNotes = notes.filter((n) => n.nullifierHash !== "");

  // Format timestamp
  const formatDate = (ts: number) =>
    new Date(ts).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });


  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-xl w-full max-w-md mx-auto">
      {/* Header: Balance + Expand toggle + Menu */}
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <div className="text-gray-400 text-sm">Shielded Balance</div>
          <div className="flex items-baseline space-x-2">
            <span className="text-xl font-bold text-white">
              {activeNotes.length > 0
                ? activeNotes.reduce((sum, n) => sum + n.amount, 0).toFixed(4)
                : "0.0000"}{" "}
              SOL
            </span>
            {balance !== null && (
              <span className="text-sm text-gray-400">
                ({balance.toFixed(4)} SOL on-chain)
              </span>
            )}
          </div>
        </div>
        {/* small “?” icon with hover tooltip */}
            <div className="relative flex-shrink-0 group">
      <svg
        className="w-4 h-4 text-gray-500 ml-1 cursor-pointer"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          fillRule="evenodd"
          d="M18 10c0 4.418-3.582 8-8 8s-8-3.582-8-8 3.582-8 
            8-8 8 3.582 8 8zm-8-5a1 1 0 00-1 1v1a1 1 0 002 
            0V6a1 1 0 00-1-1zm2 9a2 2 0 11-4 0 2 2 0 014 0z"
          clipRule="evenodd"
        />
      </svg>
      <div
        className="
          absolute bottom-full left-1/2 transform -translate-x-1/2
          mb-1 w-48 text-xs text-gray-200 bg-[#1f1f1f] border border-gray-700
          rounded-md px-2 py-1 opacity-0 group-hover:opacity-100
          transition-opacity pointer-events-none
        "
      >
        Click a row to select a note. Use the “⋮” menu to clear selection or toggle tabs.
    </div>
      </div>
        <div className="flex items-center space-x-2">
          {/* Triple-dot menu to clear selection / hide spent */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu((prev) => !prev)}
              className="p-1 rounded hover:bg-gray-700"
            >
              <svg
                className="w-5 h-5 text-gray-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-1 w-40 bg-[#1f1f1f] border border-gray-700 rounded-lg shadow-lg z-10">
                <button
                  onClick={() => {
                    setSelectedIds([]);
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-gray-300 hover:bg-gray-700"
                >
                  Clear Selection
                </button>
                <button
                  onClick={() => {
                    setActiveTab((prev) =>
                      prev === "active" ? "spent" : "active"
                    );
                    setShowMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 text-gray-300 hover:bg-gray-700"
                >
                  {activeTab === "active" ? "Show Spent" : "Show Active"}
                </button>
              </div>
            )}
          </div>
          {/* Expand/collapse chevron */}
          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1 rounded hover:bg-gray-700"
          >
            {isExpanded ? (
              <svg
                className="w-5 h-5 text-gray-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.585l3.71-4.354a.75.75 0 111.14.976l-4.25 5a.75.75 0 01-1.14 0l-4.25-5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5 text-gray-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.415l-3.71 4.354a.75.75 0 11-1.14-.976l4.25-5a.75.75 0 011.14 0l4.25 5a.75.75 0 01-.02 1.06z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Expandable content */}
      {isExpanded && (
        <div>
          {/* Tab selector */}
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setActiveTab("active")}
              className={`flex-1 py-2 text-center text-sm font-medium ${activeTab === "active"
                ? "text-white border-b-2 border-yellow-400"
                : "text-gray-400 hover:text-gray-200"
                }`}
            >
              Active ({activeNotes.length})
            </button>
            <button
              onClick={() => setActiveTab("spent")}
              className={`flex-1 py-2 text-center text-sm font-medium ${activeTab === "spent"
                ? "text-white border-b-2 border-yellow-400"
                : "text-gray-400 hover:text-gray-200"
                }`}
            >
              Spent ({spentNotes.length})
            </button>
          </div>

          {/* Notes list (compact table) */}
          <div className="max-h-64 overflow-auto">
            <table className="w-full table-fixed">
              <thead className="sticky top-0 bg-[#1f1f1f]">
                <tr>
                  <th className="w-1/12 px-2 py-1"></th>
                  <th className="w-5/12 px-2 py-1 text-left text-xs text-gray-400">
                    Date
                  </th>
                  <th className="w-4/12 px-2 py-1 text-right text-xs text-gray-400">
                    Amount
                  </th>
                  <th className="w-2/12 px-2 py-1 text-xs text-gray-400">
                    Pool
                  </th>
                  {activeTab === "spent" && (
                    <th className="w-3/12 px-2 py-1 text-xs text-gray-400 truncate">
                      Nullifier Hash
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {(activeTab === "active" ? activeNotes : spentNotes).map(
                  (note) => (
                    <tr
                      key={note.id}
                      onClick={() => handleRowClick(note.id)}
                      className={`cursor-pointer hover:bg-gray-800 ${selectedIds.includes(note.id)
                        ? "bg-gray-700"
                        : "bg-transparent"
                        }`}
                    >
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(note.id)}
                          readOnly
                          className="h-4 w-4 text-yellow-400"
                        />
                      </td>
                      <td className="px-2 py-1 text-xs text-gray-200">
                        {formatDate(note.timestamp)}
                      </td>
                      <td className="px-2 py-1 text-right text-sm text-white">
                        {note.amount.toFixed(4)}
                      </td>
                      <td className="px-2 py-1 text-xs text-gray-300 truncate">
                        {note.poolId}
                      </td>
                      {activeTab === "spent" && (
                        <td className="px-2 py-1 text-xs text-red-400 truncate">
                          {note.nullifierHash}
                        </td>
                      )}

                    </tr>
                  )
                )}
                {isLoadingNotes && (
                  <tr>
                    <td colSpan={4} className="px-2 py-2 text-center text-gray-500 text-xs">
                      Loading notes…
                    </td>
                  </tr>
                )}
                {!isLoadingNotes &&
                  (activeTab === "active"
                    ? activeNotes.length === 0
                    : spentNotes.length === 0) && (
                    <tr>
                      <td colSpan={4} className="px-2 py-2 text-center text-gray-500 text-xs">
                        {activeTab === "active"
                          ? "No active notes found."
                          : "No spent notes."}
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
