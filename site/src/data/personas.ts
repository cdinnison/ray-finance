export interface PersonaPage {
  slug: string;
  persona: string;
  headline: string;
  subtitle: string;
  painPoints: { title: string; description: string }[];
  howRayHelps: {
    title: string;
    description: string;
    exampleQuery: string;
  }[];
  scenario: {
    situation: string;
    question: string;
    rayResponse: string;
  };
  relatedPersonas: string[];
  metaTitle: string;
  metaDescription: string;
}

export const personas: PersonaPage[] = [
  {
    slug: "freelancers",
    persona: "Freelancers",
    headline: "A financial advisor that gets freelancer income",
    subtitle:
      "Irregular paychecks, quarterly taxes, and feast-or-famine cycles make traditional budgeting tools useless. Ray works with your actual cash flow patterns.",
    painPoints: [
      {
        title: "Income changes every month",
        description:
          "You got paid $12k in March and $2k in April. Budgeting apps that average your income give you a number that never existed.",
      },
      {
        title: "Quarterly tax estimation is a guess",
        description:
          "You set aside 30% sometimes, forget other times, and panic every quarter. Underpay and you owe penalties. Overpay and you gave the IRS a free loan.",
      },
      {
        title: "Business and personal blur together",
        description:
          "That lunch was half client meeting, half catching up with a friend. Your bank account doesn't know the difference, and neither does your spreadsheet.",
      },
      {
        title: "Feast-or-famine cash flow",
        description:
          "Big months feel rich. Dry months feel broke. Without a runway number tied to your actual burn rate, you're always guessing if you're okay.",
      },
    ],
    howRayHelps: [
      {
        title: "Income smoothing from real data",
        description:
          "Ray calculates your rolling average income, flags months above and below trend, and tells you what your sustainable monthly spend actually is.",
        exampleQuery: "what's my average monthly income over the last 6 months?",
      },
      {
        title: "Quarterly tax estimates on demand",
        description:
          "Ask Ray what you owe and it calculates estimated taxes from your actual YTD income, factoring in deductions you've told it about.",
        exampleQuery:
          "how much should I set aside for Q2 estimated taxes?",
      },
      {
        title: "Runway tied to your burn rate",
        description:
          "Ray knows your savings balance, your average monthly expenses, and your income pipeline. Ask how long you can survive a dry spell and get a real answer.",
        exampleQuery:
          "if I get no new clients, how many months of runway do I have?",
      },
      {
        title: "Spending pattern detection",
        description:
          "Ray spots when your spending creeps up during good months so you can build a buffer instead of inflating your lifestyle.",
        exampleQuery:
          "am I spending more in months when I earn more?",
      },
    ],
    scenario: {
      situation:
        "It's April 10th. You just finished a $15k project but have nothing lined up for May. Rent is $2,400 and quarterly taxes are due in 5 days.",
      question: "I just got paid $15k but Q2 taxes are due. What should I do?",
      rayResponse:
        "Based on your YTD income of $38,200, your Q2 estimated tax payment should be around $4,580. After setting that aside, you'll have $10,420 from this payment. Your average monthly burn is $4,820 — so that's 2.2 months of runway without new income. You have $14,300 in savings as a backstop. I'd recommend moving the $4,580 to your tax savings account today and keeping the rest liquid until you land the next contract.",
    },
    relatedPersonas: ["solopreneurs", "new-grads"],
    metaTitle: "Ray Finance for Freelancers — AI Budgeting for Irregular Income",
    metaDescription:
      "Ray connects to your bank and helps freelancers manage irregular income, estimate quarterly taxes, and track runway. Open source, local-first CLI.",
  },
  {
    slug: "couples",
    persona: "Couples",
    headline: "Financial clarity for two people, one life",
    subtitle:
      "Joint accounts, separate accounts, shared goals, different spending habits. Ray sees all of it together and helps you make decisions as a team.",
    painPoints: [
      {
        title: "No combined picture",
        description:
          "You have three checking accounts, two savings accounts, and a brokerage. No app shows your actual combined net worth without one of you manually entering everything.",
      },
      {
        title: "Spending alignment fights",
        description:
          "One of you thinks dining out is fine. The other thinks it's out of control. Without shared data, it's opinions versus opinions.",
      },
      {
        title: "Shared goals are hard to track",
        description:
          "The house down payment needs $60k. You're both saving, but into different accounts. Nobody knows the real number without adding it up manually.",
      },
      {
        title: "Income disparity makes splitting awkward",
        description:
          "50/50 doesn't feel fair when one person earns twice as much. Proportional splitting sounds good but requires constant recalculation.",
      },
    ],
    howRayHelps: [
      {
        title: "Combined net worth from all accounts",
        description:
          "Link both partners' accounts. Ray shows your true combined net worth, broken down by who owns what and what's shared.",
        exampleQuery: "what's our combined net worth right now?",
      },
      {
        title: "Spending comparisons without judgment",
        description:
          "Ray shows you exactly what each person spent and where. Replace arguments with data.",
        exampleQuery: "how much did each of us spend on dining this month?",
      },
      {
        title: "Shared goal tracking across accounts",
        description:
          "Set a savings goal and Ray aggregates progress across multiple accounts automatically. No spreadsheet needed.",
        exampleQuery:
          "how close are we to the house down payment goal?",
      },
      {
        title: "Fair split calculations",
        description:
          "Ray calculates proportional splits based on actual income. Ask it to rebalance shared expenses any time salaries change.",
        exampleQuery:
          "based on our incomes, what's a fair split for shared expenses?",
      },
    ],
    scenario: {
      situation:
        "You and your partner just got engaged. You want to merge finances, but you have $22k in student loans and they have $45k in savings. You need to figure out a plan together.",
      question:
        "we're getting married — should we merge accounts or keep them separate?",
      rayResponse:
        "Right now, your combined net worth is $23,000 ($45,000 savings minus $22,000 debt). Here are the numbers either way: merged, you'd pay off the loans in 7 months at your combined savings rate and start fresh. Separate, the loans take 14 months from your income alone. A common middle ground: joint account for shared expenses (rent, groceries, utilities — about $4,200/mo for you two), separate accounts for personal spending, and attack the debt together from the joint surplus. Want me to model the monthly contributions for that setup?",
    },
    relatedPersonas: ["parents", "new-grads"],
    metaTitle: "Ray Finance for Couples — Combined Financial Planning",
    metaDescription:
      "Ray connects to both partners' bank accounts and gives couples a combined financial picture, shared goal tracking, and fair split calculations. Open source CLI.",
  },
  {
    slug: "college-students",
    persona: "College Students",
    headline: "Your first budget, without the lecture",
    subtitle:
      "Part-time income, student loans, and zero financial education. Ray helps you build real money habits before you graduate.",
    painPoints: [
      {
        title: "Never budgeted before",
        description:
          "You know you should have a budget but don't know where to start. Categories, percentages, and rules of thumb feel arbitrary when you make $800 a month.",
      },
      {
        title: "Student loans are abstract",
        description:
          "You signed promissory notes for numbers that didn't feel real. Now you have $34k in loans and no idea what that actually means for your life after graduation.",
      },
      {
        title: "Irregular part-time income",
        description:
          "Your hours change every week. Some months you work 25 hours, others 10. Consistent budgeting is impossible when your paycheck is a moving target.",
      },
      {
        title: "Building credit from zero",
        description:
          "You got a student credit card but aren't sure how much to use it, when to pay, or how any of it affects the credit score you don't have yet.",
      },
    ],
    howRayHelps: [
      {
        title: "A budget that matches your actual income",
        description:
          "Ray looks at what you actually earn and spend, then suggests a simple budget based on your real numbers, not some influencer's 50/30/20 rule.",
        exampleQuery: "create a budget based on what I actually spend",
      },
      {
        title: "Student loan reality check",
        description:
          "Ray calculates what your loans will actually cost after graduation — monthly payment, total interest, payoff timeline — so you can plan before it hits.",
        exampleQuery:
          "what will my student loan payments look like after graduation?",
      },
      {
        title: "Spending awareness without shame",
        description:
          "Ray shows you where your money goes without moralizing about it. See the data, decide for yourself.",
        exampleQuery: "where did my money go this month?",
      },
      {
        title: "Credit card coaching",
        description:
          "Ray tracks your credit utilization and payment timing. It flags when you're carrying a balance or getting close to a utilization threshold.",
        exampleQuery: "what's my credit card utilization right now?",
      },
    ],
    scenario: {
      situation:
        "You're a sophomore working part-time at a coffee shop. You made $720 this month but spent $680, mostly on food and going out. You have $34k in student loans accumulating interest.",
      question: "I barely have any money left this month. Am I doing something wrong?",
      rayResponse:
        "You earned $720 and spent $680 — that's $40 left, which is tight but not unusual for a part-time student. Here's where it went: $310 dining out and delivery, $140 groceries, $120 subscriptions, $110 other. The dining number stands out — that's 46% of your income. If you shifted half of those meals to groceries, you'd save roughly $100/month. Over the school year, that's $900 toward an emergency fund. Your $34k in loans are accruing about $130/month in interest right now — you can't change that yet, but building even a small buffer now will matter a lot at graduation.",
    },
    relatedPersonas: ["new-grads", "freelancers"],
    metaTitle:
      "Ray Finance for College Students — Build Money Habits Early",
    metaDescription:
      "Ray helps college students create their first budget, understand student loans, and build financial habits. Free, open-source CLI that connects to your bank.",
  },
  {
    slug: "parents",
    persona: "Parents",
    headline: "Family finances that actually make sense",
    subtitle:
      "Childcare costs, education savings, growing expenses, and shrinking free time. Ray tracks it all so you can focus on your family.",
    painPoints: [
      {
        title: "Childcare costs are overwhelming",
        description:
          "Daycare is $1,800/month. That's more than your car payment, student loans, and groceries combined. Planning around it requires knowing exactly where every other dollar goes.",
      },
      {
        title: "Education savings feel impossible",
        description:
          "You should be saving for college, but between diapers and daycare, 529 contributions feel like a luxury. You don't know if $100/month is enough or pointless.",
      },
      {
        title: "Expenses grow faster than income",
        description:
          "Every year adds soccer fees, school supplies, bigger clothes, more food. Your raise didn't cover the increase and you can't pinpoint where the budget broke.",
      },
      {
        title: "No time to manage money",
        description:
          "Between work, kids, and keeping the house running, you haven't opened your budgeting app in three months. Financial planning requires time you don't have.",
      },
    ],
    howRayHelps: [
      {
        title: "Family expense tracking on autopilot",
        description:
          "Ray categorizes everything automatically. Ask a question in 10 seconds instead of spending an hour in a spreadsheet.",
        exampleQuery: "how much are we spending on kid-related expenses?",
      },
      {
        title: "Education savings projections",
        description:
          "Ray projects what your current 529 contributions will be worth at enrollment and tells you if you're on track or need to adjust.",
        exampleQuery:
          "if I save $200/month for college, what will we have in 15 years?",
      },
      {
        title: "Budget impact analysis for big decisions",
        description:
          "Thinking about a second kid, a bigger house, or switching to one income? Ray models the impact on your actual budget.",
        exampleQuery:
          "can we afford for one of us to go part-time?",
      },
      {
        title: "Yearly cost-of-kid tracking",
        description:
          "Ray calculates what your kids cost year over year so you can plan for increases instead of being surprised by them.",
        exampleQuery:
          "how much more are we spending on the kids this year vs last year?",
      },
    ],
    scenario: {
      situation:
        "Your second child starts daycare next month. That's another $1,600/month. You're already tight on the budget and haven't contributed to the 529 in four months.",
      question:
        "with the second kid in daycare, can we still save anything?",
      rayResponse:
        "Your current monthly surplus is $820 after all expenses. Adding $1,600 for daycare puts you $780/month in the red. Here are your options: your dining and entertainment spending is $640/month — cutting that in half saves $320. Your streaming subscriptions total $89/month across 6 services. And you're paying $210/month on a gym membership neither of you has used since January. Those three changes get you to roughly break-even. The 529 contributions ($200/month) should pause until the oldest moves to preschool in 14 months — at that point daycare drops by $400/month and you can resume saving.",
    },
    relatedPersonas: ["couples", "solopreneurs"],
    metaTitle: "Ray Finance for Parents — Family Budget Planning with AI",
    metaDescription:
      "Ray helps parents track childcare costs, plan education savings, and manage growing family expenses. Open-source CLI that connects to your bank.",
  },
  {
    slug: "solopreneurs",
    persona: "Solopreneurs",
    headline: "Business and personal finances, finally separated",
    subtitle:
      "When your business account is your personal account, every financial question has two answers. Ray gives you both.",
    painPoints: [
      {
        title: "Business and personal are the same account",
        description:
          "Your business revenue hits the same account as your paycheck used to. You're technically profitable but personally broke, and you can't tell which is which.",
      },
      {
        title: "Revenue isn't income",
        description:
          "You brought in $18k last month but $11k was expenses and taxes. You don't know your actual take-home until you do the math manually, which you never do in time.",
      },
      {
        title: "Runway is a mystery",
        description:
          "How many months can your business survive without revenue? The answer requires knowing your real business burn rate separated from personal spend, and nobody tracks that automatically.",
      },
      {
        title: "Tax separation is a nightmare",
        description:
          "Your accountant needs business expenses isolated. You've been meaning to go through six months of transactions to tag them. It hasn't happened.",
      },
    ],
    howRayHelps: [
      {
        title: "Revenue vs. take-home clarity",
        description:
          "Ray tracks gross revenue, business expenses, estimated taxes, and what's actually left for you to live on.",
        exampleQuery: "what's my actual take-home after business expenses this month?",
      },
      {
        title: "Business runway calculations",
        description:
          "Ray separates your business burn rate from personal spending and tells you exactly how long your business can survive a revenue gap.",
        exampleQuery: "what's my business runway if revenue drops to zero?",
      },
      {
        title: "Expense categorization for taxes",
        description:
          "Ray identifies likely business expenses from your transaction history. Review and confirm instead of starting from scratch.",
        exampleQuery:
          "show me all transactions that look like business expenses this quarter",
      },
      {
        title: "Personal budget from actual owner draws",
        description:
          "Ray builds your personal budget from what you actually transfer to yourself, not from top-line revenue that distorts your spending picture.",
        exampleQuery:
          "based on my owner draws, what's my real personal monthly income?",
      },
    ],
    scenario: {
      situation:
        "You run a one-person SaaS doing $8k MRR. Your business account has $22k but you're not sure how much is yours vs. how much you need to keep for taxes and operating costs.",
      question: "my business account has $22k — how much of that can I actually pay myself?",
      rayResponse:
        "Let me break down that $22k. Your monthly operating costs average $3,200 (hosting, tools, contractor). Estimated quarterly taxes based on YTD revenue: $6,400 due in 46 days. You should keep at least 2 months operating costs as a buffer — that's $6,400. So: $22,000 minus $6,400 taxes minus $6,400 buffer minus $3,200 this month's costs = $6,000 you can safely pay yourself right now. That's consistent with your average owner draw of $5,800/month. Want me to set up an alert when the business account drops below the buffer threshold?",
    },
    relatedPersonas: ["freelancers", "parents"],
    metaTitle:
      "Ray Finance for Solopreneurs — Separate Business & Personal Finances",
    metaDescription:
      "Ray helps solopreneurs separate business and personal finances, track runway, calculate take-home pay, and estimate taxes. Open-source CLI.",
  },
  {
    slug: "retirees",
    persona: "Retirees",
    headline: "Make your money last as long as you do",
    subtitle:
      "Fixed income, rising healthcare costs, and withdrawal math that changes every year. Ray monitors your portfolio and tells you when to adjust.",
    painPoints: [
      {
        title: "Withdrawal rate uncertainty",
        description:
          "The 4% rule is a starting point, not a plan. Market downturns, unexpected expenses, and inflation mean your safe withdrawal rate changes constantly.",
      },
      {
        title: "Healthcare costs keep rising",
        description:
          "Medicare doesn't cover everything. Supplemental insurance, prescriptions, and dental add up to $600+/month that wasn't in your original retirement plan.",
      },
      {
        title: "Portfolio monitoring is stressful",
        description:
          "You check your brokerage three times a day during market drops. You know you shouldn't make emotional decisions but you don't have a framework for when to actually worry.",
      },
      {
        title: "Fixed income doesn't flex",
        description:
          "Social Security plus pension is a fixed number. When inflation pushes grocery costs up 15%, your income doesn't move. Something has to give and you're not sure what.",
      },
    ],
    howRayHelps: [
      {
        title: "Dynamic withdrawal guidance",
        description:
          "Ray calculates your sustainable withdrawal rate based on current portfolio value, spending, and market conditions — not a static rule from 1994.",
        exampleQuery: "at my current spending, how long will my portfolio last?",
      },
      {
        title: "Healthcare cost tracking",
        description:
          "Ray isolates and trends your healthcare spending so you can see the real growth rate and adjust your budget before it squeezes everything else.",
        exampleQuery:
          "how much have my healthcare costs increased this year?",
      },
      {
        title: "Portfolio check without panic",
        description:
          "Ask Ray how your portfolio is doing and get a calm, data-driven answer. It compares your drawdown to historical recoveries and tells you if action is needed.",
        exampleQuery: "my portfolio dropped 8% — should I be worried?",
      },
      {
        title: "Inflation impact analysis",
        description:
          "Ray tracks how inflation is actually hitting your specific spending categories, not the national average that doesn't reflect your grocery bill.",
        exampleQuery:
          "how has inflation affected my actual spending this year?",
      },
    ],
    scenario: {
      situation:
        "You're 68, retired for 3 years. Your portfolio dropped 12% this quarter and you're withdrawing $5,200/month. Your spouse needs a dental procedure that costs $4,800 out of pocket.",
      question:
        "with the market down, can we afford the dental work without running out of money?",
      rayResponse:
        "Your portfolio is currently $680,000, down from $772,000 at its peak. At your current withdrawal rate of $5,200/month ($62,400/year), that's a 9.2% withdrawal rate — above the safe zone. However, you have $18,400 in your money market account that isn't invested. The $4,800 dental work from that account won't affect your portfolio. The bigger issue is the withdrawal rate: at 9.2%, your portfolio lasts roughly 14 years. Reducing withdrawals by $400/month (cutting discretionary spending) brings you to 8.5% and extends that to 17 years. Social Security's COLA adjustment in January should add $180/month, which helps further. The dental work is fine — but let's look at the monthly number.",
    },
    relatedPersonas: ["couples", "parents"],
    metaTitle: "Ray Finance for Retirees — Portfolio Monitoring & Withdrawal Planning",
    metaDescription:
      "Ray helps retirees monitor portfolios, plan withdrawals, track healthcare costs, and make their money last. Open-source, local-first CLI.",
  },
  {
    slug: "new-grads",
    persona: "New Grads",
    headline: "Your first real salary deserves a real plan",
    subtitle:
      "Student loans, a 401k you don't understand, and more money than you've ever had. Ray helps you make the right moves in year one.",
    painPoints: [
      {
        title: "Student loan repayment paralysis",
        description:
          "Standard, graduated, income-driven, extended — there are 8 repayment plans and you picked the default because you didn't know the difference. You might be overpaying by hundreds a month.",
      },
      {
        title: "401k decisions with no context",
        description:
          "HR gave you a packet with 15 fund options and a match formula you don't understand. You're either contributing nothing or guessing at a percentage.",
      },
      {
        title: "Lifestyle inflation is instant",
        description:
          "You went from $800/month to $5,200/month overnight. Within 3 months your spending expanded to fill every dollar and you have nothing saved.",
      },
      {
        title: "No emergency fund baseline",
        description:
          "Everyone says save 3-6 months of expenses, but you don't know what your expenses even are yet. You've been working for 4 months and haven't established a baseline.",
      },
    ],
    howRayHelps: [
      {
        title: "Loan repayment comparison",
        description:
          "Ray models different repayment strategies against your actual income and shows you the total cost and timeline of each option.",
        exampleQuery:
          "should I do income-driven repayment or pay extra on the standard plan?",
      },
      {
        title: "401k contribution optimization",
        description:
          "Ray calculates the optimal contribution to capture your full employer match and shows you the paycheck impact in real dollars.",
        exampleQuery:
          "how much should I put in my 401k to get the full match?",
      },
      {
        title: "Lifestyle creep detection",
        description:
          "Ray compares your spending month-over-month and flags categories that are growing faster than they should. Catch the creep before it becomes the new normal.",
        exampleQuery:
          "is my spending increasing since I started this job?",
      },
      {
        title: "Emergency fund roadmap",
        description:
          "Ray calculates your actual monthly expenses from your real spending data and builds a savings target based on your specific numbers, not a generic rule.",
        exampleQuery:
          "how much do I need in an emergency fund based on my actual expenses?",
      },
    ],
    scenario: {
      situation:
        "You graduated 3 months ago. You're earning $72k/year, have $28k in student loans at 5.5%, and your employer matches 401k contributions up to 4%. You've saved $1,200 so far.",
      question:
        "should I pay off loans faster or save more? I can only do one.",
      rayResponse:
        "Let's run the numbers on both. Your employer matches 4% — that's $240/month in free money you'd miss by not contributing. Your loans at 5.5% cost you $128/month in interest. Priority order: 1) contribute 4% to 401k ($240/month) to capture the match — that's an instant 100% return. 2) Build your emergency fund to $8,400 (2 months of your $4,200 average spending) — at your current savings rate, that's 6 more months. 3) Then throw extra at the loans. Right now your minimum loan payment is $302/month. Adding just $150/month extra cuts 3 years off the payoff timeline and saves $4,100 in interest. You can do all three on your salary — the math works if you hold dining at current levels instead of letting it grow.",
    },
    relatedPersonas: ["college-students", "couples"],
    metaTitle: "Ray Finance for New Grads — Student Loans, 401k & First Budget",
    metaDescription:
      "Ray helps new graduates navigate student loan repayment, 401k decisions, emergency fund building, and first-salary budgeting. Free, open-source CLI.",
  },
];

export function getPersonaBySlug(slug: string): PersonaPage | undefined {
  return personas.find((p) => p.slug === slug);
}
