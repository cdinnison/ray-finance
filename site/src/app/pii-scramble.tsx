"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*";

interface Segment {
  text: string;
  redacted?: string;
}

const LINES: Segment[][] = [
  [
    { text: "Sarah Chen", redacted: "[USER]" },
    { text: " earns $85k at " },
    { text: "Acme Corp", redacted: "[EMPLOYER]" },
    { text: "." },
  ],
  [
    { text: "James", redacted: "[PARTNER]" },
    { text: " manages the household budget." },
  ],
  [{ text: "Checking balance: $4,802" }],
  [{ text: "Visa balance: -$1,200 @ 22.99% APR" }],
];

// Collect all redactable segments in order
const REDACTABLE: { lineIdx: number; segIdx: number }[] = [];
LINES.forEach((line, lineIdx) => {
  line.forEach((seg, segIdx) => {
    if (seg.redacted) REDACTABLE.push({ lineIdx, segIdx });
  });
});

function scrambleText(original: string, target: string, progress: number): string {
  const len = Math.max(original.length, target.length);
  let result = "";
  for (let i = 0; i < len; i++) {
    const charProgress = Math.min(1, Math.max(0, progress * len - i) / 3);
    if (charProgress >= 1) {
      result += target[i] ?? "";
    } else if (charProgress > 0) {
      result += CHARS[Math.floor(Math.random() * CHARS.length)];
    } else {
      result += original[i] ?? "";
    }
  }
  return result;
}

function useInView(ref: React.RefObject<HTMLElement | null>, threshold = 0.5) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold]);
  return inView;
}

// Which word index is currently scrambling (-1 = not started, >= REDACTABLE.length = done)
type AnimState = {
  /** Index into REDACTABLE of the word currently animating */
  activeWord: number;
  /** 0..1 progress of the current word's scramble */
  wordProgress: number;
};

export function PIIScramble() {
  const containerRef = useRef<HTMLDivElement>(null);
  const inView = useInView(containerRef);
  const [anim, setAnim] = useState<AnimState>({ activeWord: -1, wordProgress: 0 });

  const done = anim.activeWord >= REDACTABLE.length;
  const scrambling = anim.activeWord >= 0 && !done;

  const runWord = useCallback((wordIdx: number) => {
    const SCRAMBLE_DURATION = 800; // ms per word
    const start = performance.now();

    function tick() {
      const elapsed = performance.now() - start;
      const p = Math.min(1, elapsed / SCRAMBLE_DURATION);
      setAnim({ activeWord: wordIdx, wordProgress: p });
      if (p < 1) {
        requestAnimationFrame(tick);
      } else if (wordIdx + 1 < REDACTABLE.length) {
        // Pause 500ms then start next word
        setTimeout(() => runWord(wordIdx + 1), 500);
      } else {
        // All done
        setAnim({ activeWord: REDACTABLE.length, wordProgress: 1 });
      }
    }
    requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (!inView) return;
    // Initial delay before first word starts
    const delay = setTimeout(() => runWord(0), 800);
    return () => clearTimeout(delay);
  }, [inView, runWord]);

  function getSegmentDisplay(lineIdx: number, segIdx: number, seg: Segment): { text: string; color: string } {
    if (!seg.redacted) {
      return { text: seg.text, color: "text-stone-300" };
    }

    // Find this segment's index in the redactable list
    const wordIdx = REDACTABLE.findIndex(r => r.lineIdx === lineIdx && r.segIdx === segIdx);

    if (anim.activeWord < 0 || wordIdx > anim.activeWord) {
      // Not yet reached — show original
      return { text: seg.text, color: "text-red-400" };
    }

    if (wordIdx < anim.activeWord || done) {
      // Already redacted
      return { text: seg.redacted!, color: "text-stone-400" };
    }

    // Currently scrambling this word
    return {
      text: scrambleText(seg.text, seg.redacted!, anim.wordProgress),
      color: "text-amber-300",
    };
  }

  const statusLabel = done
    ? "PII redacted before sending to AI"
    : scrambling
      ? "Redacting..."
      : "Raw financial data";

  return (
    <div ref={containerRef} className="rounded-xl border border-sand-200 bg-white p-6 sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <div
          className={`h-2 w-2 rounded-full transition-colors duration-300 ${
            done
              ? "bg-stone-400"
              : scrambling
                ? "bg-amber-400 animate-pulse"
                : "bg-stone-300"
          }`}
        />
        <p className="font-mono text-xs tracking-wide text-stone-400 uppercase">
          {statusLabel}
        </p>
      </div>

      <div className="rounded-lg bg-stone-950 p-4 sm:p-6 font-mono text-xs sm:text-sm leading-relaxed">
        {LINES.map((segments, lineIdx) => (
          <p key={lineIdx} className="text-stone-300">
            {segments.map((seg, segIdx) => {
              const { text, color } = getSegmentDisplay(lineIdx, segIdx, seg);
              return (
                <span key={segIdx} className={color}>
                  {text}
                </span>
              );
            })}
          </p>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-4 text-xs text-stone-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
          PII in local database
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-stone-400" />
          What the AI receives
        </span>
      </div>
    </div>
  );
}
