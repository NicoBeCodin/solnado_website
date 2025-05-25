// src/components/Navbar.tsx
"use client";
import Link from "next/link";
import { Github, Twitter } from "lucide-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function Navbar() {
  return (
    <nav className="bg-black border-b border-gray-800 px-6 py-4 flex items-center justify-between">
      {/* Left group */}
      <div className="flex items-center space-x-4">
        <Link
          href="/docs"
          className="text-neon-green font-semibold text-lg hover:underline"
        >
          Docs
        </Link>
        <a
          href="https://github.com/nicobecodin"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-white"
        >
          <Github size={20} />
        </a>
        <a
          href="https://x.com/nicobecodin"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-white"
        >
          <Twitter size={20} />
        </a>
      </div>

      {/* Center warning */}
      <div className="text-sm font-medium text-neon-yellow">
        ⚠️ Work in progress—please check&nbsp;
        <Link
          href="/docs"
          className="underline text-neon-green font-semibold"
        >
          Docs
        </Link>
      </div>

      {/* Right group */}
      <div>
        <WalletMultiButton className="bg-gradient-to-r from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-black font-semibold" />
      </div>
    </nav>
  );
}
