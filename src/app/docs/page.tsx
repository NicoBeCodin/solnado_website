// src/app/docs/page.tsx
import fs from "fs/promises";
import path from "path";
import React from "react";
import ReactMarkdown from "react-markdown";

export default async function DocsPage() {
  // 1) Compute the absolute path
  const docPath = path.join(process.cwd(), "src/app/docs", "docs.md");
  // 2) Read it
  const content = await fs.readFile(docPath, "utf8");

  return (
    <main className="min-h-screen bg-black p-8">
      <div className="max-w-3xl mx-auto prose prose-invert text-white">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </main>
  );
}
