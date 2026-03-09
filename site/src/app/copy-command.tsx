"use client";

import { useState } from "react";

export function CopyCommand({
  command,
  className = "",
}: {
  command: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(command);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className={`group relative cursor-pointer ${className}`}
    >
      <span className="text-stone-400 font-mono">$</span>{" "}
      <span className="font-mono">{command}</span>
      {copied && <span className="ml-2 text-xs text-stone-400">✓ copied</span>}
    </button>
  );
}
