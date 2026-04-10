"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ─── Color Helpers ─── */
function G({ children }: { children: React.ReactNode }) {
  return <span className="text-lime-400">{children}</span>;
}
function R({ children }: { children: React.ReactNode }) {
  return <span className="text-red-400">{children}</span>;
}
function Y({ children }: { children: React.ReactNode }) {
  return <span className="text-amber-400">{children}</span>;
}
function W({ children }: { children: React.ReactNode }) {
  return <span className="text-white">{children}</span>;
}
function D({ children }: { children: React.ReactNode }) {
  return <span className="text-stone-500">{children}</span>;
}
function Blank() {
  return <p className="h-5" />;
}
function futureMonth(offset: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/* ─── Bank Logo ─── */
function BankLogo({ name }: { name: string }) {
  return (
    <img
      src={`/banks/${name}-favicon.png`}
      alt=""
      className="inline-block h-4 w-4 rounded-sm align-middle"
      aria-hidden="true"
    />
  );
}

/* ─── Tab Definitions ─── */
const tabs = [
  {
    label: "Status",
    command: "ray status",
    output: () => (
      <>
        <p className="text-stone-300">
          <D>{new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }).toLowerCase()}</D>
        </p>
        <Blank />
        <p className="text-stone-300">
          <D>net worth</D>{"  "}<W>$255,870</W>{" "}<G>+$133</G>
        </p>
        <p className="text-stone-500">
          {"  "}gold card <R>-$1,830</R>{"  "}<D>&middot;</D>{"  "}chase savings $12,500{"  "}<D>&middot;</D>{"  "}total checking $4,200{"  "}<D>&middot;</D>{"  "}401(k) $67,000{"  "}<D>&middot;</D>{"  "}individual $34,000
        </p>
        <Blank />
        <p className="text-stone-300">
          <D>spending</D>{"  "}<W>$3,608</W> this month <D>&middot;</D> <Y>$1,728 more</Y> than last month
        </p>
        <p className="text-stone-500">
          {"  "}shopping <Y>+$850</Y>{"  "}<D>&middot;</D>{"  "}food &amp; drink <D>+$396</D>{"  "}<D>&middot;</D>{"  "}services <D>+$145</D>{"  "}<D>&middot;</D>{"  "}personal care <D>+$130</D>
        </p>
        <Blank />
        <p className="text-stone-300">
          {"  "}<Y>{"████████████"}</Y><D>{"░░░░"}</D>{"  "}shopping 75%
        </p>
        <p className="text-stone-300">
          {"  "}<G>{"███████"}</G><D>{"░░░░░░░░░"}</D>{"  "}food &amp; drink 44%
        </p>
        <Blank />
        <p className="text-stone-300">
          <D>score</D>{"      "}<G>76</G><D>/100</D>{"  "}<D>&middot;  3d no dining</D>
        </p>
      </>
    ),
  },
  {
    label: "Chat",
    command: "ray",
    isChat: true,
    question: "can we afford a weekend trip to tahoe next month? we were thinking around $1,200",
    output: () => null,
    answer: () => (
      <>
        <p className="text-stone-300">
          Let me check your numbers.
        </p>
        <Blank />
        <p className="text-stone-300">
          You have <W>$4,200</W> in checking and <W>$1,620</W> left in this month{"'"}s budget. Next month{"'"}s fixed expenses are <W>$2,840</W> (rent, utilities, car payment, subscriptions), leaving roughly <W>$2,560</W> discretionary after your next paycheck on the 15th.
        </p>
        <Blank />
        <p className="text-stone-300">
          <G>$1,200 is doable</G>, but it{"'"}d use 47% of your discretionary budget. That leaves <W>$1,360</W> for the rest of the month — tight if anything unexpected comes up.
        </p>
        <Blank />
        <p className="text-stone-300">
          One thing to flag: your emergency fund goal needs <W>$1,100/mo</W> and you{"'"}ve only saved <W>$400</W> this month. If you take the trip and skip this month{"'"}s contribution, you push the target date from {futureMonth(8)} to {futureMonth(10)}.
        </p>
        <Blank />
        <p className="text-stone-300">
          <D>Short answer:</D> you can afford it, but I{"'"}d budget closer to $1,000 to stay comfortable.
        </p>
      </>
    ),
  },
  {
    label: "Accounts",
    command: "ray accounts",
    output: () => (
      <>
        <p className="text-stone-300 font-semibold">
          <D>Linked Accounts</D>
        </p>
        <Blank />
        <p className="text-white">
          <BankLogo name="chase" />{" "}Chase
        </p>
        <p className="text-stone-500">
          {"  "}Total Checking ••4821{"       "}<D>checking</D>{"    "}$4,200.00
        </p>
        <p className="text-stone-500">
          {"  "}Chase Savings ••9103{"        "}<D>savings</D>{"     "}$12,500.00
        </p>
        <p className="text-stone-500">
          {"  "}Sapphire Preferred ••7744{"   "}<D>credit</D>{"      "}<R>-$1,830.00</R>
        </p>
        <Blank />
        <p className="text-white">
          <BankLogo name="robinhood" />{" "}Robinhood
        </p>
        <p className="text-stone-500">
          {"  "}Individual ••2205{"           "}<D>brokerage</D>{"   "}$34,000.00
        </p>
        <Blank />
        <p className="text-white">
          <BankLogo name="sofi" />{" "}SoFi
        </p>
        <p className="text-stone-500">
          {"  "}SoFi Checking ••3318{"        "}<D>checking</D>{"    "}$2,800.00
        </p>
        <p className="text-stone-500">
          {"  "}SoFi Savings ••3319{"         "}<D>savings</D>{"     "}$8,400.00
        </p>
      </>
    ),
  },
  {
    label: "Spending",
    command: "ray spending this_month",
    output: () => (
      <>
        <p className="text-stone-300">
          <D>{new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</D>{"  "}<W>$3,608</W> spent
        </p>
        <Blank />
        <p className="text-stone-300">
          {"  "}<Y>{"████████████"}</Y><D>{"░░░░"}</D>{"  "}shopping{"           "}<W>$1,280</W>{"  "}<Y>+$850</Y>
        </p>
        <p className="text-stone-300">
          {"  "}<G>{"█████████"}</G><D>{"░░░░░░░"}</D>{"  "}food &amp; drink{"      "}<W>$890</W>{"   "}<D>+$396</D>
        </p>
        <p className="text-stone-300">
          {"  "}<G>{"██████"}</G><D>{"░░░░░░░░░░"}</D>{"  "}transportation{"     "}<W>$520</W>{"   "}<D>+$80</D>
        </p>
        <p className="text-stone-300">
          {"  "}<G>{"█████"}</G><D>{"░░░░░░░░░░░"}</D>{"  "}services{"           "}<W>$410</W>{"   "}<D>+$145</D>
        </p>
        <p className="text-stone-300">
          {"  "}<G>{"████"}</G><D>{"░░░░░░░░░░░░"}</D>{"  "}personal care{"      "}<W>$290</W>{"   "}<D>+$130</D>
        </p>
        <p className="text-stone-300">
          {"  "}<G>{"██"}</G><D>{"░░░░░░░░░░░░░░"}</D>{"  "}utilities{"          "}<W>$218</W>{"   "}<G>-$12</G>
        </p>
        <Blank />
        <p className="text-stone-500">
          {"  "}vs last month: <Y>$1,728 more</Y>
        </p>
      </>
    ),
  },
  {
    label: "Goals",
    command: "ray goals",
    output: () => (
      <>
        <p className="text-stone-300">
          <D>Financial Goals</D>
        </p>
        <Blank />
        <p className="text-stone-300">
          <G>{"██████"}</G><D>{"░░░░░░░░░░"}</D>{"  "}Emergency Fund
        </p>
        <p className="text-stone-500">
          {"  "}$6,200 / $15,000{"  "}<D>&middot;</D>{"  "}41%{"  "}<D>&middot;</D>{"  "}need <W>$1,100/mo</W>{"  "}<D>&middot;</D>{"  "}{futureMonth(8)}
        </p>
        <Blank />
        <p className="text-stone-300">
          <G>{"█████████"}</G><D>{"░░░░░░░"}</D>{"  "}Japan Vacation
        </p>
        <p className="text-stone-500">
          {"  "}$2,800 / $5,000{"   "}<D>&middot;</D>{"  "}56%{"  "}<D>&middot;</D>{"  "}need <W>$440/mo</W>{"   "}<D>&middot;</D>{"  "}{futureMonth(5)}
        </p>
        <Blank />
        <p className="text-stone-300">
          <G>{"████"}</G><D>{"░░░░░░░░░░░░"}</D>{"  "}House Down Payment
        </p>
        <p className="text-stone-500">
          {"  "}$22,000 / $45,000{"  "}<D>&middot;</D>{"  "}49%{"  "}<D>&middot;</D>{"  "}need <W>$1,278/mo</W>{"  "}<D>&middot;</D>{"  "}{futureMonth(18)}
        </p>
        <Blank />
        <p className="text-stone-300">
          <Y>{"████████████"}</Y><D>{"░░░░"}</D>{"  "}Debt Payoff
        </p>
        <p className="text-stone-500">
          {"  "}$34,200 remaining{"  "}<D>&middot;</D>{"  "}75%{"  "}<D>&middot;</D>{"  "}need <W>$1,140/mo</W>{"  "}<D>&middot;</D>{"  "}{futureMonth(20)}
        </p>
      </>
    ),
  },
];

/* ─── Terminal Demo ─── */
export function TerminalDemo() {
  const [activeTab, setActiveTab] = useState(0);
  const [typedCommand, setTypedCommand] = useState(tabs[0].command);
  const [typedQuestion, setTypedQuestion] = useState("");
  const [outputVisible, setOutputVisible] = useState(true);
  const [questionPhase, setQuestionPhase] = useState<"hidden" | "typing" | "done">("hidden");
  const [phase, setPhase] = useState<"typing" | "output" | "pause">("pause");

  useEffect(() => {
    let cancelled = false;
    const timers: NodeJS.Timeout[] = [];
    const schedule = (fn: () => void, ms: number) => {
      const id = setTimeout(() => { if (!cancelled) fn(); }, ms);
      timers.push(id);
      return id;
    };

    const tab = tabs[activeTab];
    const isChat = !!(tab as any).isChat;
    const command = tab.command;

    // Check for reduced motion
    const prefersReduced = typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setTypedCommand(command);
      setOutputVisible(true);
      setPhase("pause");
      if (isChat) {
        setTypedQuestion((tab as any).question);
        setQuestionPhase("done");
      }
      schedule(() => setActiveTab((i) => (i + 1) % tabs.length), isChat ? 20000 : 7500);
      return () => { cancelled = true; timers.forEach(clearTimeout); };
    }

    // Reset
    setTypedCommand("");
    setTypedQuestion("");
    setOutputVisible(false);
    setQuestionPhase("hidden");
    setPhase("typing");

    let charIndex = 0;

    const typeChar = () => {
      if (cancelled) return;
      if (charIndex <= command.length) {
        setTypedCommand(command.slice(0, charIndex));
        charIndex++;
        schedule(typeChar, 30 + Math.random() * 20);
      } else if (isChat) {
        schedule(() => {
          setPhase("output");
          setQuestionPhase("typing");
          const question = (tab as any).question as string;
          let qIndex = 0;
          const typeQ = () => {
            if (cancelled) return;
            if (qIndex <= question.length) {
              setTypedQuestion(question.slice(0, qIndex));
              qIndex++;
              schedule(typeQ, 20 + Math.random() * 15);
            } else {
              schedule(() => {
                setQuestionPhase("done");
                setOutputVisible(true);
                schedule(() => {
                  setPhase("pause");
                  setActiveTab((i) => (i + 1) % tabs.length);
                }, 20000);
              }, 600);
            }
          };
          schedule(typeQ, 300);
        }, 400);
      } else {
        schedule(() => {
          setOutputVisible(true);
          setPhase("output");
          schedule(() => {
            setPhase("pause");
            setActiveTab((i) => (i + 1) % tabs.length);
          }, 7500);
        }, 400);
      }
    };

    schedule(typeChar, 300);
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [activeTab]);

  const handleTabClick = (i: number) => {
    if (i === activeTab) return;
    setActiveTab(i);
  };

  const currentTab = tabs[activeTab];
  const isChat = !!(currentTab as any).isChat;
  const Output = currentTab.output;
  const Answer = isChat ? (currentTab as any).answer : null;

  return (
    <>
      {/* Title bar */}
      <div className="relative flex items-center border-b border-stone-800 px-4 py-3">
        <div className="flex gap-2">
          <div className="h-3 w-3 rounded-full bg-stone-700" />
          <div className="h-3 w-3 rounded-full bg-stone-700" />
          <div className="h-3 w-3 rounded-full bg-stone-700" />
        </div>
        <span className="absolute inset-x-0 text-center font-mono text-xs text-stone-500">
          ray — zsh
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-stone-800">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            type="button"
            onClick={() => handleTabClick(i)}
            className={`flex-1 px-4 py-1.5 font-mono text-[11px] tracking-wide transition-colors cursor-pointer border-stone-800 ${
              i > 0 ? "border-l" : ""
            } ${
              i === activeTab
                ? "bg-stone-950 text-stone-200"
                : "bg-stone-900/40 text-stone-500 hover:text-stone-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="overflow-y-auto p-5 font-mono text-[11px] leading-[1.7] sm:p-8 sm:text-[13px] h-[380px] sm:h-[460px]">
        {/* Command line */}
        <p className="text-stone-300">
          <span className="text-stone-500">~ $ </span>
          {typedCommand}
          {phase === "typing" && (
            <span className="inline-block w-[7px] h-[15px] ml-px align-middle bg-stone-300 animate-pulse" />
          )}
        </p>
        <Blank />

        {isChat ? (
          <>
            {questionPhase !== "hidden" && (
              <>
                {questionPhase === "typing" ? (
                  <>
                    <div className="border-t border-stone-700 -mx-5 sm:-mx-8" />
                    <p className="text-stone-300 mt-2">
                      <span className="text-stone-500">{"❯ "}</span>
                      {typedQuestion}
                      <span className="inline-block w-[7px] h-[15px] ml-px align-middle bg-stone-300 animate-pulse" />
                    </p>
                    <div className="border-t border-stone-700 -mx-5 sm:-mx-8 mt-2" />
                  </>
                ) : (
                  <div className="bg-stone-700/50 -mx-5 sm:-mx-8 px-5 sm:px-8 py-2">
                    <p className="text-white">
                      {"❯ "}{typedQuestion}
                    </p>
                  </div>
                )}
                <Blank />
              </>
            )}
            {outputVisible && Answer && <Answer />}
          </>
        ) : (
          outputVisible && <Output />
        )}
      </div>

      {/* Status bar */}
      <div className="border-t border-stone-800 px-5 py-2.5 font-mono text-[10px] text-stone-600 sm:px-8 sm:text-[11px]">
        ray{"  "}<D>&middot;</D>{"  "}synced 1h ago{"  "}<D>&middot;</D>{"  "}ctrl+c to exit
      </div>
    </>
  );
}
