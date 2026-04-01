"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const prompts = [
  {
    question: "Build me a plan to be debt-free by 2027",
    answer:
      "You owe $34,200 across two cards and a car loan. Targeting Dec 2027 means $1,140/mo. Avalanche order: Chase at 24.9% first, then auto loan at 5.1%. Redirect your $380 in unused subscriptions and you only need to find $760.",
  },
  {
    question: "Should I pay off my loans or invest the bonus?",
    answer:
      "Your student loans are at 6.8%. At your tax bracket, investing nets ~7.2% after tax. Mathematically it's close — but paying off $12k in loans frees up $340/mo in cash flow, which matters more given your goal to buy a house.",
  },
  {
    question: "Am I on track to retire by 55?",
    answer:
      "At your current savings rate of $2,100/mo, you'll hit $1.2M by 55. But your spending has crept up 12% this year. If that continues, you'll need $1.6M. The gap is fixable — lock in your 2024 spending levels.",
  },
  {
    question: "What happens if our rent goes up $500 next month?",
    answer:
      "You'd go from saving $1,200/mo to $700/mo. Your emergency fund goal pushes back 5 months. You could offset it — you're spending $380/mo on subscriptions, and three of them overlap.",
  },
  {
    question: "Build me a budget for a trip to Japan",
    answer:
      "A 10-day family trip runs ~$8,500. You have $3,200 in your travel fund. At your current savings rate, you'd be fully funded by August. Book now and you'll have it covered before departure.",
  },
  {
    question: "How much am I actually spending on the kids?",
    answer:
      "Across daycare, activities, clothes, and food: $2,340/mo. That's 38% of your take-home. Daycare alone is $1,600. It drops to $900 when Mia starts kindergarten in September.",
  },
  {
    question: "Build me a 6-month runway before I go freelance",
    answer:
      "You need $28,920 based on your burn rate. You have $18,200 saved — that's a $10,720 gap. At $1,200/mo surplus, you're 9 months out. Cut dining and subscriptions to $400 and you're there in 6.",
  },
  {
    question: "Set up a system to save $1k/mo without noticing",
    answer:
      "You have $1,580/mo in slack spend. Here's the split: drop three unused subscriptions ($140), cap dining at $400 ($320 saved), switch to annual insurance billing ($180 saved), and auto-transfer $360 on payday. Total: $1,000 even.",
  },
  {
    question: "What can I cut to max out my 401k this year?",
    answer:
      "You're contributing $800/mo. Max is $1,875/mo — that's $1,075 more. Your top cuts: DoorDash habit ($340), unused ClassPass ($60), downgrade streaming bundle ($45), and the coworking space you haven't used since March ($530). That's $975. Close enough to bridge the rest from your bonus.",
  },
  {
    question: "Build me a plan to buy a house in 18 months",
    answer:
      "For a $450k home at 10% down, you need $45k. You have $22k saved. That's $1,278/mo for 18 months. Your current surplus is $1,200 — tight but doable if you freeze discretionary spending at today's levels and route your next two bonuses straight to savings.",
  },
];

export function RotatingPrompt() {
  const [index, setIndex] = useState(0);
  const [typedQuestion, setTypedQuestion] = useState("");
  const [typedAnswer, setTypedAnswer] = useState("");
  const [phase, setPhase] = useState<"question" | "answer" | "pause">("question");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clear = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  useEffect(() => {
    const { question, answer } = prompts[index];
    let charIndex = 0;
    setTypedQuestion("");
    setTypedAnswer("");
    setPhase("question");

    const typeQuestion = () => {
      if (charIndex <= question.length) {
        setTypedQuestion(question.slice(0, charIndex));
        charIndex++;
        timeoutRef.current = setTimeout(typeQuestion, 20 + Math.random() * 15);
      } else {
        timeoutRef.current = setTimeout(() => {
          charIndex = 0;
          setPhase("answer");
          typeAnswer();
        }, 500);
      }
    };

    const typeAnswer = () => {
      if (charIndex <= answer.length) {
        setTypedAnswer(answer.slice(0, charIndex));
        charIndex++;
        timeoutRef.current = setTimeout(typeAnswer, 3 + Math.random() * 5);
      } else {
        setPhase("pause");
        timeoutRef.current = setTimeout(() => {
          setIndex((i) => (i + 1) % prompts.length);
        }, 3000);
      }
    };

    timeoutRef.current = setTimeout(typeQuestion, 300);
    return clear;
  }, [index, clear]);

  return (
    <div>
      <p className="text-stone-300">
        <span className="text-stone-600">{"❯ "}</span>
        {typedQuestion}
        {phase === "question" && <span className="animate-pulse text-stone-500">▋</span>}
      </p>
      <div className="mt-[1.7em] min-h-[6.8em]">
        <p className="text-stone-400 leading-[1.7]">
          {phase !== "question" && typedAnswer}
          {phase === "answer" && <span className="animate-pulse text-stone-500">▋</span>}
        </p>
      </div>
    </div>
  );
}
