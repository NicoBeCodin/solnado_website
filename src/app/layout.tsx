import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import React from "react";

// **Do not** import any `@solana/wallet-adapter-react` symbols here
import Providers from "@/components/Providers";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        {/* Providers is the single Client Component that injects Solana context */}
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
