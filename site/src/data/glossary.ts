export interface GlossaryTerm {
  slug: string;
  term: string;
  definition: string;
  whyItMatters: string;
  howRayHelps: string;
  example?: string;
  relatedTerms: string[];
  metaTitle: string;
  metaDescription: string;
}

export const glossaryTerms: GlossaryTerm[] = [
  {
    slug: "net-worth",
    term: "Net Worth",
    definition:
      "Net worth is the total value of everything you own (assets) minus everything you owe (liabilities). It's the single best snapshot of your overall financial health.",
    whyItMatters:
      "Tracking net worth over time reveals whether you're actually building wealth or just earning and spending. A high income means little if debt grows faster than savings. Watching the trend line — not just the number — tells you if your financial decisions are working.",
    howRayHelps:
      "Ray calculates your net worth automatically by pulling account balances from every connected bank and credit card. Ask `ray \"what is my net worth?\"` and get an instant breakdown of assets vs. liabilities, plus a month-over-month trend.",
    example:
      "If you have $50,000 in savings, $15,000 in investments, and owe $20,000 on student loans and $5,000 on a credit card, your net worth is $40,000.",
    relatedTerms: ["cash-flow", "savings-rate", "portfolio", "liquidity"],
    metaTitle: "What is Net Worth? | Ray Finance",
    metaDescription:
      "Net worth is your assets minus liabilities. Learn how to calculate it, why it matters, and how Ray tracks it automatically from your bank accounts.",
  },
  {
    slug: "emergency-fund",
    term: "Emergency Fund",
    definition:
      "An emergency fund is cash set aside specifically for unexpected expenses like medical bills, car repairs, or job loss. Most experts recommend saving three to six months of essential expenses.",
    whyItMatters:
      "Without an emergency fund, a single surprise expense can spiral into credit card debt or missed payments. It acts as a financial shock absorber, giving you time to recover without derailing long-term goals. The peace of mind alone changes how you make daily money decisions.",
    howRayHelps:
      "Ray analyzes your spending history to estimate your essential monthly expenses, then tells you exactly how many months of runway your current savings cover. Try `ray \"how many months could I survive without income?\"` to see where you stand.",
    example:
      "If your essential monthly expenses are $3,200, a fully funded emergency fund would be $9,600 to $19,200.",
    relatedTerms: ["budget", "savings-rate", "cash-flow", "sinking-fund", "liquidity"],
    metaTitle: "What is an Emergency Fund? | Ray Finance",
    metaDescription:
      "An emergency fund covers 3-6 months of expenses for unexpected events. Learn how much you need and how Ray calculates your savings runway.",
  },
  {
    slug: "budget",
    term: "Budget",
    definition:
      "A budget is a plan for how you'll allocate your income across spending categories, savings, and debt payments over a set period — usually monthly.",
    whyItMatters:
      "Budgeting is less about restriction and more about awareness. Most people underestimate their spending by 20-40% in categories like dining and subscriptions. A budget closes the gap between what you think you spend and what you actually spend, letting you redirect money toward what matters most.",
    howRayHelps:
      "Ray categorizes every transaction from your connected accounts and compares actual spending against your goals. Ask `ray \"how much did I spend on food this month vs last month?\"` to instantly spot trends without manual spreadsheet work.",
    example:
      "On a $5,000/month take-home income, you might allocate $1,500 to housing, $600 to food, $400 to transportation, $500 to savings, and distribute the rest across other categories.",
    relatedTerms: ["zero-based-budget", "cash-flow", "savings-rate", "net-income", "sinking-fund"],
    metaTitle: "What is a Budget? | Ray Finance",
    metaDescription:
      "A budget allocates your income across spending, savings, and debt. Learn budgeting basics and how Ray auto-categorizes your transactions.",
  },
  {
    slug: "debt-to-income-ratio",
    term: "Debt-to-Income Ratio",
    definition:
      "Debt-to-income ratio (DTI) compares your total monthly debt payments to your gross monthly income, expressed as a percentage. It's a key metric lenders use to evaluate your borrowing capacity.",
    whyItMatters:
      "Lenders use DTI as a gatekeeper: most mortgage lenders want to see a DTI below 36%, and anything above 43% makes approval unlikely for conventional loans. Beyond lending, your DTI tells you how much of each paycheck is already spoken for before you even think about groceries, gas, or savings.",
    howRayHelps:
      "Ray identifies recurring debt payments in your transactions and calculates your DTI automatically. Run `ray \"what is my debt-to-income ratio?\"` to see the percentage and get a breakdown of which debts are consuming the most income.",
    example:
      "If you earn $6,000/month gross and pay $1,200 in rent, $350 in student loans, and $200 in car payments, your DTI is 29% ($1,750 / $6,000).",
    relatedTerms: ["gross-income", "net-income", "mortgage", "credit-score", "amortization"],
    metaTitle: "What is Debt-to-Income Ratio? | Ray Finance",
    metaDescription:
      "Debt-to-income ratio measures monthly debt payments vs. gross income. Learn the DTI thresholds lenders use and how Ray calculates yours.",
  },
  {
    slug: "sinking-fund",
    term: "Sinking Fund",
    definition:
      "A sinking fund is money you save incrementally for a planned future expense — like a vacation, insurance premium, or holiday gifts — so the cost doesn't hit all at once.",
    whyItMatters:
      "Irregular expenses are budget killers. A $1,200 annual insurance premium feels overwhelming in one month but manageable at $100/month saved ahead of time. Sinking funds turn lumpy, stressful expenses into predictable monthly line items.",
    howRayHelps:
      "Ray can identify your recurring annual and semi-annual expenses from past transactions and suggest monthly sinking fund amounts. Ask `ray \"what large expenses should I be saving for?\"` to surface bills that caught you off guard last year.",
    example:
      "Planning a $2,400 vacation in 8 months? Set aside $300/month in a sinking fund so the money is ready when you book.",
    relatedTerms: ["budget", "emergency-fund", "zero-based-budget", "savings-rate", "cash-flow"],
    metaTitle: "What is a Sinking Fund? | Ray Finance",
    metaDescription:
      "A sinking fund saves incrementally for planned future expenses. Learn how sinking funds prevent budget shocks and how Ray identifies them.",
  },
  {
    slug: "compound-interest",
    term: "Compound Interest",
    definition:
      "Compound interest is interest earned on both your original principal and on previously accumulated interest. It's the mechanism that makes invested money grow exponentially over time.",
    whyItMatters:
      "Compound interest is the single most powerful force in personal finance — it rewards starting early more than investing large amounts later. The difference between starting to invest at 25 vs. 35 can mean hundreds of thousands of dollars by retirement, even with identical monthly contributions.",
    howRayHelps:
      "Ray can project the future value of your current savings and investment accounts using compound growth assumptions. Try `ray \"if I keep saving at this rate, what will I have in 20 years?\"` to see how compounding works on your actual balances.",
    example:
      "$10,000 invested at 7% annual return grows to $19,672 in 10 years and $38,697 in 20 years — nearly quadrupling without adding a single dollar.",
    relatedTerms: ["apy", "rule-of-72", "time-value-of-money", "index-fund", "yield"],
    metaTitle: "What is Compound Interest? | Ray Finance",
    metaDescription:
      "Compound interest earns returns on both principal and accumulated interest. Learn why starting early matters and how Ray projects your growth.",
  },
  {
    slug: "credit-score",
    term: "Credit Score",
    definition:
      "A credit score is a three-digit number (typically 300-850) that represents your creditworthiness based on your borrowing and repayment history. FICO and VantageScore are the two main scoring models.",
    whyItMatters:
      "Your credit score affects the interest rates you're offered on mortgages, auto loans, and credit cards — even a 50-point difference can mean tens of thousands in extra interest over a mortgage's lifetime. It also influences rental applications, insurance premiums, and sometimes employment decisions.",
    howRayHelps:
      "While Ray doesn't pull your credit score directly, it monitors the financial behaviors that affect it: credit utilization, payment timing, and debt balances. Ask `ray \"am I using too much of my available credit?\"` to check utilization across your cards.",
    example:
      "A borrower with a 760 credit score might get a 6.5% mortgage rate, while a 660 score could mean 7.8% — on a $300,000 loan, that's over $90,000 more in total interest.",
    relatedTerms: ["fico-score", "debt-to-income-ratio", "apr", "mortgage", "credit-score"],
    metaTitle: "What is a Credit Score? | Ray Finance",
    metaDescription:
      "A credit score (300-850) rates your creditworthiness and affects loan rates. Learn what impacts it and how Ray monitors related behaviors.",
  },
  {
    slug: "cash-flow",
    term: "Cash Flow",
    definition:
      "Cash flow is the net amount of money moving in and out of your accounts over a period. Positive cash flow means you're earning more than you spend; negative cash flow means the opposite.",
    whyItMatters:
      "You can have a high net worth and still face a cash flow crisis — equity in a house doesn't pay the electric bill. Tracking cash flow weekly or monthly reveals whether your day-to-day finances are sustainable, and it's the earliest warning sign of trouble before debt starts accumulating.",
    howRayHelps:
      "Ray aggregates all your income and expenses across connected accounts to show real-time cash flow. Run `ray \"what's my cash flow this month?\"` to see exactly how much money came in vs. went out, broken down by category.",
    example:
      "If you earned $4,800 this month and spent $4,200, your cash flow is +$600 — money available for savings or debt payoff.",
    relatedTerms: ["net-income", "budget", "savings-rate", "net-worth", "liquidity"],
    metaTitle: "What is Cash Flow? | Ray Finance",
    metaDescription:
      "Cash flow measures money in vs. money out over a period. Learn why positive cash flow matters and how Ray tracks yours in real time.",
  },
  {
    slug: "amortization",
    term: "Amortization",
    definition:
      "Amortization is the process of paying off a loan through regular installments that cover both principal and interest. Early payments are mostly interest; later payments are mostly principal.",
    whyItMatters:
      "Understanding amortization reveals a frustrating truth: in the first years of a 30-year mortgage, most of your payment goes to interest, not equity. This knowledge motivates strategies like extra principal payments, which can shave years off a loan and save substantial interest.",
    howRayHelps:
      "Ray can analyze your loan payments and show how much is going to principal vs. interest each month. Ask `ray \"how much of my mortgage payment goes to interest?\"` to understand exactly where your money is going.",
    example:
      "On a $250,000 mortgage at 7% for 30 years, your first payment of $1,663 splits roughly $1,458 to interest and only $205 to principal.",
    relatedTerms: ["mortgage", "apr", "debt-to-income-ratio", "compound-interest", "net-worth"],
    metaTitle: "What is Amortization? | Ray Finance",
    metaDescription:
      "Amortization spreads loan repayment across installments of principal and interest. Learn how it works and how Ray breaks down your payments.",
  },
  {
    slug: "apr",
    term: "APR (Annual Percentage Rate)",
    definition:
      "APR is the yearly cost of borrowing money, expressed as a percentage. Unlike a simple interest rate, APR includes fees and other charges, giving a more complete picture of what a loan actually costs.",
    whyItMatters:
      "Two loans can advertise the same interest rate but have very different APRs once fees are included. Comparing APRs — not just rates — is the only apples-to-apples way to evaluate loan offers. Credit card APRs are especially important since they compound on carried balances.",
    howRayHelps:
      "Ray tracks interest charges across your credit cards and loans to help you understand the real cost of your debt. Try `ray \"how much interest did I pay on all my cards last year?\"` to see the total cost of carrying balances.",
    example:
      "A $200,000 mortgage at 6.5% interest rate might have a 6.8% APR after origination fees and points are factored in.",
    relatedTerms: ["apy", "compound-interest", "mortgage", "amortization", "credit-score"],
    metaTitle: "What is APR? | Ray Finance",
    metaDescription:
      "APR is the annual cost of borrowing including fees. Learn how APR differs from interest rate and how Ray tracks your interest charges.",
  },
  {
    slug: "apy",
    term: "APY (Annual Percentage Yield)",
    definition:
      "APY is the real rate of return on a savings or investment account, accounting for the effect of compounding interest. It's always equal to or higher than the stated interest rate.",
    whyItMatters:
      "APY lets you compare savings accounts and CDs on equal footing, regardless of how frequently they compound. A savings account compounding daily at 4.9% has a higher APY than one compounding monthly at the same rate — APY captures that difference so you can pick the better deal.",
    howRayHelps:
      "Ray can show you the interest earned across your savings accounts over time. Ask `ray \"how much interest have my savings accounts earned this year?\"` to see your effective returns across all accounts.",
    example:
      "A high-yield savings account advertising 5.0% APY on a $10,000 balance earns approximately $500 in one year, compounding daily.",
    relatedTerms: ["compound-interest", "apr", "yield", "savings-rate", "rule-of-72"],
    metaTitle: "What is APY? | Ray Finance",
    metaDescription:
      "APY is the annual return on savings including compound interest. Learn how APY works and how Ray shows your actual savings returns.",
  },
  {
    slug: "asset-allocation",
    term: "Asset Allocation",
    definition:
      "Asset allocation is how you divide your investment portfolio among different asset classes — stocks, bonds, real estate, and cash. It's the primary driver of both risk and long-term returns.",
    whyItMatters:
      "Studies consistently show that asset allocation explains over 90% of portfolio return variability — more than individual stock picks or market timing. Getting the right mix for your age, goals, and risk tolerance is the most impactful investment decision you can make.",
    howRayHelps:
      "Ray can analyze your connected investment accounts and show your current allocation across asset types. Try `ray \"what does my investment allocation look like?\"` to see if your portfolio matches your intended risk level.",
    example:
      "A 30-year-old might target 80% stocks and 20% bonds, while someone nearing retirement at 60 might shift to 40% stocks and 60% bonds.",
    relatedTerms: ["diversification", "portfolio", "index-fund", "mutual-fund", "roth-ira"],
    metaTitle: "What is Asset Allocation? | Ray Finance",
    metaDescription:
      "Asset allocation divides investments among stocks, bonds, and cash. Learn why it drives returns and how Ray shows your current mix.",
  },
  {
    slug: "bear-market",
    term: "Bear Market",
    definition:
      "A bear market is a sustained decline of 20% or more in a broad market index from its recent peak. Bear markets are typically accompanied by widespread pessimism and reduced economic activity.",
    whyItMatters:
      "Bear markets test investor discipline. Historically, they last an average of 9-16 months and are followed by recoveries that more than make up the losses. Selling during a bear market locks in losses, while staying invested — or even increasing contributions — has historically led to stronger long-term returns.",
    howRayHelps:
      "Ray keeps your focus on your personal financial picture rather than market headlines. Ask `ray \"how has my portfolio changed in the last 6 months?\"` to see your actual account performance in context, not panic-inducing index numbers.",
    example:
      "The S&P 500 dropped 34% in early 2020 during COVID but recovered to new highs within 5 months — investors who sold at the bottom missed the fastest recovery in history.",
    relatedTerms: ["bull-market", "diversification", "dollar-cost-averaging", "portfolio", "index-fund"],
    metaTitle: "What is a Bear Market? | Ray Finance",
    metaDescription:
      "A bear market is a 20%+ decline in market indexes. Learn how long they last, historical recoveries, and how Ray keeps you focused on your plan.",
  },
  {
    slug: "bull-market",
    term: "Bull Market",
    definition:
      "A bull market is a sustained period of rising prices in financial markets, typically defined as a 20% or greater increase from a recent low. Bull markets reflect widespread investor optimism and economic growth.",
    whyItMatters:
      "Bull markets create wealth but also breed overconfidence. During prolonged bull runs, investors tend to take on more risk than they realize, overweight trendy sectors, and assume recent returns will continue. Understanding that bull markets are cyclical helps you stay diversified and avoid chasing performance.",
    howRayHelps:
      "Ray helps you stay grounded during bull markets by showing your portfolio performance alongside your actual financial goals. Try `ray \"am I on track for my savings goals?\"` to focus on your plan rather than market euphoria.",
    example:
      "The bull market from 2009 to 2020 lasted over 11 years, with the S&P 500 rising roughly 400% — the longest bull run in U.S. history.",
    relatedTerms: ["bear-market", "capital-gains", "diversification", "portfolio", "index-fund"],
    metaTitle: "What is a Bull Market? | Ray Finance",
    metaDescription:
      "A bull market is a 20%+ rise in financial markets. Learn what drives bull markets and how Ray keeps your plan on track during euphoria.",
  },
  {
    slug: "capital-gains",
    term: "Capital Gains",
    definition:
      "A capital gain is the profit you earn when you sell an asset for more than you paid. Capital gains are taxed differently depending on how long you held the asset — short-term (under one year) vs. long-term (over one year).",
    whyItMatters:
      "The tax difference is significant: short-term gains are taxed as ordinary income (up to 37%), while long-term gains are taxed at preferential rates (0%, 15%, or 20%). Simply holding an investment for one year and one day instead of eleven months can cut your tax bill dramatically.",
    howRayHelps:
      "Ray can help you understand the tax implications of your investment gains. Ask `ray \"how much have my investments gained this year?\"` to see unrealized gains across your connected brokerage accounts.",
    example:
      "Buying stock at $1,000 and selling at $1,500 produces a $500 capital gain. Held for 14 months, you'd pay ~$75 in tax (15% rate) vs. ~$120 at the 24% ordinary income rate.",
    relatedTerms: ["tax-bracket", "portfolio", "index-fund", "diversification", "roth-ira"],
    metaTitle: "What is a Capital Gain? | Ray Finance",
    metaDescription:
      "Capital gains are profits from selling assets. Learn short-term vs. long-term tax rates and how Ray tracks your investment gains.",
  },
  {
    slug: "diversification",
    term: "Diversification",
    definition:
      "Diversification means spreading investments across different asset classes, sectors, and geographies to reduce the impact of any single investment's poor performance on your overall portfolio.",
    whyItMatters:
      "Diversification is the closest thing to a free lunch in investing. While it won't prevent losses entirely, it ensures that a downturn in one area doesn't devastate your entire portfolio. Concentrated positions — like holding mostly your employer's stock — carry outsized risk that diversification eliminates.",
    howRayHelps:
      "Ray analyzes holdings across all your connected investment accounts to flag concentration risk. Run `ray \"is my portfolio diversified?\"` to see how your investments are spread across sectors and asset types.",
    example:
      "An investor with 100% in tech stocks would have lost 33% in 2022, while a diversified portfolio of stocks, bonds, and international holdings might have lost only 15%.",
    relatedTerms: ["asset-allocation", "index-fund", "mutual-fund", "portfolio", "dollar-cost-averaging"],
    metaTitle: "What is Diversification? | Ray Finance",
    metaDescription:
      "Diversification spreads investments to reduce risk. Learn why concentration is dangerous and how Ray checks your portfolio balance.",
  },
  {
    slug: "dollar-cost-averaging",
    term: "Dollar-Cost Averaging",
    definition:
      "Dollar-cost averaging (DCA) is investing a fixed amount at regular intervals regardless of market conditions. You automatically buy more shares when prices are low and fewer when prices are high.",
    whyItMatters:
      "DCA removes the emotional paralysis of trying to time the market. Research shows that even investing at market peaks with DCA produces solid long-term returns, because the consistency matters more than the timing. It turns investing from a stressful decision into an automated habit.",
    howRayHelps:
      "Ray tracks your recurring investment contributions and can show the pattern over time. Ask `ray \"how consistent have my investment contributions been?\"` to see if you're sticking to your DCA schedule.",
    example:
      "Investing $500/month into an S&P 500 index fund for 10 years totals $60,000 in contributions but could grow to ~$86,000 at a 7% average annual return.",
    relatedTerms: ["compound-interest", "index-fund", "bear-market", "portfolio", "savings-rate"],
    metaTitle: "What is Dollar-Cost Averaging? | Ray Finance",
    metaDescription:
      "Dollar-cost averaging invests fixed amounts at regular intervals. Learn why DCA beats market timing and how Ray tracks your consistency.",
  },
  {
    slug: "expense-ratio",
    term: "Expense Ratio",
    definition:
      "An expense ratio is the annual fee a fund charges its shareholders, expressed as a percentage of assets. It covers management, administration, and operating costs and is automatically deducted from returns.",
    whyItMatters:
      "Expense ratios silently erode returns over decades. A 1% difference in fees on a $100,000 investment over 30 years can cost you over $100,000 in lost growth. Index funds typically charge 0.03-0.20%, while actively managed funds charge 0.50-1.50% — and most active funds still underperform their benchmark.",
    howRayHelps:
      "Ray can help you evaluate the cost of your current investments. Try `ray \"what fees am I paying on my investments?\"` to understand how expense ratios are affecting your long-term returns.",
    example:
      "A fund with a 0.03% expense ratio charges $3/year per $10,000 invested. A fund with a 1.0% ratio charges $100/year — that $97 annual difference compounds significantly over 30 years.",
    relatedTerms: ["index-fund", "mutual-fund", "compound-interest", "portfolio", "apy"],
    metaTitle: "What is an Expense Ratio? | Ray Finance",
    metaDescription:
      "Expense ratio is the annual fee funds charge shareholders. Learn how even small fee differences compound and how Ray shows your costs.",
  },
  {
    slug: "fico-score",
    term: "FICO Score",
    definition:
      "A FICO score is the most widely used credit scoring model, created by Fair Isaac Corporation. It ranges from 300 to 850 and is used by 90% of top U.S. lenders to make credit decisions.",
    whyItMatters:
      "While \"credit score\" is a general term, FICO is the specific model most lenders actually use. Your FICO score is built from five weighted factors: payment history (35%), amounts owed (30%), length of credit history (15%), new credit (10%), and credit mix (10%). Understanding these weights tells you exactly where to focus improvement efforts.",
    howRayHelps:
      "Ray monitors the financial behaviors that feed into your FICO score, especially credit utilization and payment patterns. Ask `ray \"what percentage of my credit limit am I using?\"` to check utilization, the second-biggest FICO factor.",
    example:
      "A FICO score of 740+ is generally considered \"very good\" and qualifies you for the best interest rates. Below 670 is considered \"fair\" and significantly increases borrowing costs.",
    relatedTerms: ["credit-score", "debt-to-income-ratio", "apr", "mortgage", "liquidity"],
    metaTitle: "What is a FICO Score? | Ray Finance",
    metaDescription:
      "FICO score is the credit scoring model used by 90% of top lenders. Learn the five factors that determine it and how Ray monitors them.",
  },
  {
    slug: "gross-income",
    term: "Gross Income",
    definition:
      "Gross income is the total amount you earn before any deductions — taxes, insurance premiums, retirement contributions, and other withholdings. It's the \"headline\" number on your job offer.",
    whyItMatters:
      "Gross income is the starting point for almost every financial calculation: tax brackets, DTI ratios, retirement contribution limits, and loan qualification. But it's also misleading if you use it for budgeting — your actual spending power is net income, which can be 25-40% less than gross.",
    howRayHelps:
      "Ray can identify your gross income from paycheck deposits and separate pre-tax deductions. Run `ray \"what is my gross income this year?\"` to see your total earnings aggregated from all income sources.",
    example:
      "A salary of $85,000/year is your gross income. After federal tax, state tax, Social Security, Medicare, and health insurance, your net might be $58,000-$63,000.",
    relatedTerms: ["net-income", "tax-bracket", "debt-to-income-ratio", "savings-rate", "budget"],
    metaTitle: "What is Gross Income? | Ray Finance",
    metaDescription:
      "Gross income is total earnings before deductions. Learn how it differs from net income and how Ray calculates yours from all sources.",
  },
  {
    slug: "index-fund",
    term: "Index Fund",
    definition:
      "An index fund is a type of mutual fund or ETF designed to track the performance of a specific market index, like the S&P 500. Instead of picking individual stocks, it holds all (or a representative sample of) the securities in that index.",
    whyItMatters:
      "Over any 15-year period, roughly 90% of actively managed funds underperform their benchmark index. Index funds offer broad diversification, ultra-low fees, and market-matching returns — a combination that has made them the default recommendation from Warren Buffett to most financial advisors.",
    howRayHelps:
      "Ray can identify index funds in your portfolio and compare their performance against your other holdings. Ask `ray \"what percentage of my investments are in index funds?\"` to see your passive vs. active investment split.",
    example:
      "A total U.S. stock market index fund with a 0.03% expense ratio gives you exposure to over 3,600 companies for $3/year per $10,000 invested.",
    relatedTerms: ["expense-ratio", "mutual-fund", "diversification", "asset-allocation", "dollar-cost-averaging"],
    metaTitle: "What is an Index Fund? | Ray Finance",
    metaDescription:
      "An index fund tracks a market index like the S&P 500 with ultra-low fees. Learn why index funds outperform most active funds over time.",
  },
  {
    slug: "inflation",
    term: "Inflation",
    definition:
      "Inflation is the rate at which the general level of prices for goods and services rises, reducing what each dollar can buy. The Federal Reserve targets an annual inflation rate of approximately 2%.",
    whyItMatters:
      "Inflation is a silent tax on cash savings. Money sitting in a checking account earning 0.01% loses purchasing power every year. At 3% inflation, $100,000 in cash has the buying power of only $74,000 after ten years. This is why investing — not just saving — is essential for long-term wealth preservation.",
    howRayHelps:
      "Ray helps you understand whether your savings are keeping pace with inflation. Try `ray \"is my savings rate beating inflation?\"` to see if your money is growing in real terms or losing ground.",
    example:
      "At 3% annual inflation, something that costs $100 today will cost $134 in ten years. Your savings need to grow at least 3% annually just to maintain purchasing power.",
    relatedTerms: ["apy", "compound-interest", "time-value-of-money", "yield", "savings-rate"],
    metaTitle: "What is Inflation? | Ray Finance",
    metaDescription:
      "Inflation is the rate at which prices rise, reducing purchasing power. Learn how it erodes cash savings and how Ray tracks your real returns.",
  },
  {
    slug: "liquidity",
    term: "Liquidity",
    definition:
      "Liquidity refers to how quickly and easily you can convert an asset to cash without significant loss in value. Cash and savings accounts are highly liquid; real estate and retirement accounts are not.",
    whyItMatters:
      "Having too little liquidity means you can't cover emergencies without selling investments at a loss or paying penalties. Having too much means cash sitting idle, losing value to inflation. The right balance depends on your job stability, expenses, and how quickly you might need access to funds.",
    howRayHelps:
      "Ray shows you how much of your wealth is in liquid vs. illiquid accounts. Ask `ray \"how much liquid cash do I have access to?\"` to see your readily available funds across all connected accounts.",
    example:
      "A savings account is fully liquid — you can withdraw anytime. A 401(k) is illiquid before age 59.5 because early withdrawals trigger a 10% penalty plus income tax.",
    relatedTerms: ["emergency-fund", "net-worth", "cash-flow", "savings-rate", "portfolio"],
    metaTitle: "What is Liquidity? | Ray Finance",
    metaDescription:
      "Liquidity measures how easily assets convert to cash. Learn why the right liquid-to-illiquid balance matters and how Ray tracks yours.",
  },
  {
    slug: "mortgage",
    term: "Mortgage",
    definition:
      "A mortgage is a loan used to purchase real estate, where the property itself serves as collateral. Most mortgages are repaid over 15 or 30 years through fixed or adjustable-rate monthly payments.",
    whyItMatters:
      "A mortgage is likely the largest debt you'll ever take on, and small differences in terms have enormous long-term costs. Choosing a 15-year over a 30-year mortgage, making one extra payment per year, or securing a rate just 0.5% lower can save $50,000-$100,000 or more over the life of the loan.",
    howRayHelps:
      "Ray tracks your mortgage payments and can show you how much has gone to principal vs. interest over time. Run `ray \"how much equity do I have in my home based on my payments?\"` to see your principal paydown progress.",
    example:
      "A $350,000 30-year mortgage at 7% has a monthly payment of $2,329. Over 30 years, you'll pay $488,281 in total interest — more than the original loan amount.",
    relatedTerms: ["amortization", "apr", "debt-to-income-ratio", "credit-score", "net-worth"],
    metaTitle: "What is a Mortgage? | Ray Finance",
    metaDescription:
      "A mortgage is a long-term loan for real estate. Learn how rates and terms affect total cost and how Ray tracks your equity progress.",
  },
  {
    slug: "mutual-fund",
    term: "Mutual Fund",
    definition:
      "A mutual fund pools money from many investors to purchase a diversified portfolio of stocks, bonds, or other securities. It's managed by a professional fund manager who makes buy/sell decisions.",
    whyItMatters:
      "Mutual funds democratized investing by making diversification accessible with small amounts of money. However, the rise of index funds has exposed the high fees many actively managed mutual funds charge. The key question isn't whether to use mutual funds, but whether to use actively managed ones (high fees, usually underperform) or index mutual funds (low fees, market returns).",
    howRayHelps:
      "Ray identifies mutual funds in your investment accounts and can compare their performance and fees. Ask `ray \"what mutual funds do I own and what are their expense ratios?\"` to evaluate whether you're getting value for the fees.",
    example:
      "A mutual fund with a $1,000 minimum investment and 0.85% expense ratio gives you instant diversification across 200+ stocks, but charges $85/year per $10,000 invested.",
    relatedTerms: ["index-fund", "expense-ratio", "diversification", "asset-allocation", "portfolio"],
    metaTitle: "What is a Mutual Fund? | Ray Finance",
    metaDescription:
      "A mutual fund pools investor money for a diversified portfolio. Learn active vs. index funds and how Ray compares your fund fees.",
  },
  {
    slug: "net-income",
    term: "Net Income",
    definition:
      "Net income is your take-home pay after all deductions — federal and state taxes, Social Security, Medicare, health insurance premiums, and retirement contributions. It's the amount actually deposited in your bank account.",
    whyItMatters:
      "Net income is the only number that matters for budgeting because it's what you actually have to spend. Many people budget based on gross income and wonder why they come up short. Understanding the gap between gross and net also reveals optimization opportunities — like adjusting tax withholding or maximizing pre-tax retirement contributions.",
    howRayHelps:
      "Ray calculates your net income directly from the deposits hitting your bank account. Run `ray \"what is my monthly take-home pay?\"` to see your actual net income averaged over recent months, accounting for any variability.",
    example:
      "On an $85,000 salary, after 22% effective tax rate, 7.65% FICA, and $200/month health insurance, your net income is roughly $4,800/month.",
    relatedTerms: ["gross-income", "tax-bracket", "budget", "cash-flow", "savings-rate"],
    metaTitle: "What is Net Income? | Ray Finance",
    metaDescription:
      "Net income is your take-home pay after all deductions. Learn why it's the only number that matters for budgeting and how Ray tracks it.",
  },
  {
    slug: "portfolio",
    term: "Portfolio",
    definition:
      "A portfolio is the complete collection of your financial investments — stocks, bonds, mutual funds, ETFs, real estate, and other assets. Your portfolio's composition determines your risk exposure and expected returns.",
    whyItMatters:
      "Most people's investments are scattered across old 401(k)s, IRAs, brokerage accounts, and maybe a spouse's accounts. Without seeing the full picture, you can't know your true asset allocation, total fees, or concentration risk. A unified portfolio view is essential for making informed investment decisions.",
    howRayHelps:
      "Ray connects to all your investment accounts and shows a consolidated portfolio view. Ask `ray \"show me my full investment portfolio across all accounts\"` to see your complete holdings, allocation, and performance in one place.",
    example:
      "A well-constructed portfolio for a 35-year-old might include: 60% U.S. stocks, 20% international stocks, 15% bonds, and 5% REITs, spread across a 401(k), Roth IRA, and taxable brokerage account.",
    relatedTerms: ["asset-allocation", "diversification", "net-worth", "index-fund", "mutual-fund"],
    metaTitle: "What is a Portfolio? | Ray Finance",
    metaDescription:
      "A portfolio is your total collection of investments. Learn why a unified view matters and how Ray consolidates all your accounts.",
  },
  {
    slug: "roth-ira",
    term: "Roth IRA",
    definition:
      "A Roth IRA is a retirement account funded with after-tax dollars, meaning withdrawals in retirement — including all investment growth — are completely tax-free. Contributions (but not earnings) can be withdrawn anytime without penalty.",
    whyItMatters:
      "A Roth IRA is one of the most powerful wealth-building tools available because tax-free growth over decades is extraordinarily valuable. If you contribute $6,500/year from age 25 to 65, you'd contribute $260,000 — but at 7% returns, the account would hold approximately $1.3 million, all withdrawable tax-free. No other account offers this benefit.",
    howRayHelps:
      "Ray tracks contributions and growth in your connected Roth IRA. Try `ray \"how much have I contributed to my Roth IRA this year?\"` to ensure you're on track to max out the annual limit.",
    example:
      "The 2024 Roth IRA contribution limit is $7,000 ($8,000 if 50+). Income phase-outs begin at $146,000 for single filers and $230,000 for married filing jointly.",
    relatedTerms: ["401k", "compound-interest", "tax-bracket", "capital-gains", "time-value-of-money"],
    metaTitle: "What is a Roth IRA? | Ray Finance",
    metaDescription:
      "A Roth IRA offers tax-free retirement withdrawals funded with after-tax dollars. Learn contribution limits, income limits, and how Ray tracks yours.",
  },
  {
    slug: "rule-of-72",
    term: "Rule of 72",
    definition:
      "The Rule of 72 is a quick mental math shortcut: divide 72 by your annual rate of return to estimate how many years it takes for an investment to double in value.",
    whyItMatters:
      "The Rule of 72 makes abstract compounding tangible. It immediately reveals the real cost of low returns: money in a 1% savings account takes 72 years to double, while a 10% stock market return doubles in just 7.2 years. It also works in reverse — at 3% inflation, the purchasing power of cash is cut in half every 24 years.",
    howRayHelps:
      "Ray can project doubling times for your various accounts based on their historical returns. Ask `ray \"at my current savings rate, how long until my investments double?\"` to see the Rule of 72 applied to your actual balances.",
    example:
      "At 7% annual return: 72 / 7 = ~10.3 years to double. $50,000 becomes $100,000 in about a decade without adding another dollar.",
    relatedTerms: ["compound-interest", "apy", "time-value-of-money", "inflation", "yield"],
    metaTitle: "What is the Rule of 72? | Ray Finance",
    metaDescription:
      "The Rule of 72 estimates investment doubling time: divide 72 by your return rate. Learn this mental shortcut and how Ray projects your growth.",
  },
  {
    slug: "savings-rate",
    term: "Savings Rate",
    definition:
      "Your savings rate is the percentage of your income that you save or invest rather than spend. It's calculated by dividing the amount saved by your total income over the same period.",
    whyItMatters:
      "Savings rate is a more actionable metric than net worth because you directly control it. Financial independence research shows that savings rate — not income level — is the primary determinant of when you can retire. Someone saving 50% of their income can reach financial independence in roughly 17 years, regardless of whether they earn $50,000 or $200,000.",
    howRayHelps:
      "Ray calculates your savings rate automatically by comparing income deposits to total spending. Run `ray \"what is my savings rate?\"` to see the percentage and how it's trended over the last several months.",
    example:
      "If you earn $5,000/month after tax and save $1,000 (including retirement contributions), your savings rate is 20%.",
    relatedTerms: ["budget", "net-income", "cash-flow", "emergency-fund", "compound-interest"],
    metaTitle: "What is Savings Rate? | Ray Finance",
    metaDescription:
      "Savings rate is the percentage of income saved, not spent. Learn why it matters more than income level and how Ray calculates yours.",
  },
  {
    slug: "tax-bracket",
    term: "Tax Bracket",
    definition:
      "A tax bracket is a range of income taxed at a specific rate in the U.S. progressive tax system. Only the income within each bracket is taxed at that bracket's rate — not your entire income.",
    whyItMatters:
      "The most common tax misconception is that earning more pushes all your income into a higher bracket. In reality, the U.S. uses marginal rates: if you earn $50,000, only the dollars above $44,725 are taxed at 22% — the rest is taxed at lower rates. Understanding this prevents irrational decisions like turning down raises or overtime.",
    howRayHelps:
      "Ray can estimate which tax brackets your income falls into based on your earnings. Ask `ray \"what tax bracket am I in?\"` to see your marginal rate and approximate effective rate based on your year-to-date income.",
    example:
      "For a single filer in 2024 earning $95,000: the first $11,600 is taxed at 10%, $11,601-$47,150 at 12%, $47,151-$95,000 at 22%. Effective rate: ~17.6%.",
    relatedTerms: ["gross-income", "net-income", "capital-gains", "roth-ira", "401k"],
    metaTitle: "What is a Tax Bracket? | Ray Finance",
    metaDescription:
      "Tax brackets set marginal rates on income ranges. Learn how progressive taxation actually works and how Ray estimates your effective rate.",
  },
  {
    slug: "time-value-of-money",
    term: "Time Value of Money",
    definition:
      "The time value of money (TVM) is the principle that a dollar today is worth more than a dollar in the future, because today's dollar can be invested to earn returns. It's the foundation of all financial planning.",
    whyItMatters:
      "TVM explains why starting to invest at 22 with $200/month beats starting at 32 with $400/month. It's why lottery winners should take the lump sum (usually), why inflation matters, and why carrying high-interest debt is so costly. Every major financial decision involves a TVM trade-off between present and future value.",
    howRayHelps:
      "Ray applies TVM thinking to your financial situation by projecting future account values and comparing options. Try `ray \"what would an extra $200/month in savings be worth in 20 years?\"` to see how your decisions today compound into the future.",
    example:
      "$10,000 invested today at 7% annual return is worth $76,123 in 30 years. Waiting 10 years to invest the same $10,000 means it only grows to $38,697 — half the value for a third less time.",
    relatedTerms: ["compound-interest", "rule-of-72", "inflation", "apy", "roth-ira"],
    metaTitle: "What is the Time Value of Money? | Ray Finance",
    metaDescription:
      "Time value of money means a dollar today beats a dollar tomorrow. Learn how TVM drives financial decisions and how Ray projects your growth.",
  },
  {
    slug: "yield",
    term: "Yield",
    definition:
      "Yield is the income return on an investment, expressed as a percentage of the investment's cost or current market value. It includes interest payments (bonds), dividends (stocks), or distributions (funds), but not capital gains.",
    whyItMatters:
      "Yield tells you how much cash income an investment generates without selling it. Retirees and income-focused investors rely on yield to cover living expenses. However, chasing high yield can be dangerous — unusually high yields often signal that a bond issuer is in financial trouble or a stock's price has dropped due to fundamental problems.",
    howRayHelps:
      "Ray can calculate the income yield across your investment accounts. Ask `ray \"how much dividend and interest income did my investments generate this year?\"` to see your portfolio's cash return.",
    example:
      "A bond purchased for $1,000 that pays $40/year in interest has a 4% yield. A stock trading at $50 that pays $1.50/year in dividends has a 3% dividend yield.",
    relatedTerms: ["apy", "compound-interest", "diversification", "portfolio", "capital-gains"],
    metaTitle: "What is Yield? | Ray Finance",
    metaDescription:
      "Yield is the income return on an investment as a percentage. Learn interest vs. dividend yield and how Ray tracks your portfolio income.",
  },
  {
    slug: "zero-based-budget",
    term: "Zero-Based Budget",
    definition:
      "A zero-based budget assigns every dollar of income a specific job — spending, saving, or debt payment — until your income minus your allocated amounts equals exactly zero. No dollar is left \"unbudgeted.\"",
    whyItMatters:
      "Traditional budgeting often leaves a vague surplus that slowly disappears. Zero-based budgeting forces intentionality: every dollar has a purpose, whether it's rent, groceries, or a sinking fund for car repairs. This level of specificity tends to surface hidden waste and accelerate progress toward financial goals.",
    howRayHelps:
      "Ray shows where your unallocated money goes each month by categorizing every transaction. Try `ray \"where did my unaccounted-for spending go last month?\"` to find the leaks in your budget that a zero-based approach would plug.",
    example:
      "$5,000 income: $1,500 housing + $600 food + $300 transportation + $400 insurance + $200 entertainment + $500 debt payment + $1,000 savings + $500 miscellaneous = $0 remaining.",
    relatedTerms: ["budget", "cash-flow", "savings-rate", "sinking-fund", "net-income"],
    metaTitle: "What is Zero-Based Budgeting? | Ray Finance",
    metaDescription:
      "Zero-based budgeting assigns every dollar a job until income minus allocations equals zero. Learn the method and how Ray tracks your spending.",
  },
  {
    slug: "401k",
    term: "401(k)",
    definition:
      "A 401(k) is an employer-sponsored retirement savings plan that lets you contribute pre-tax income (traditional) or after-tax income (Roth 401k), often with an employer match. Contributions grow tax-deferred until withdrawal in retirement.",
    whyItMatters:
      "An employer 401(k) match is free money — if your employer matches 50% of contributions up to 6% of salary, not contributing at least 6% is leaving thousands on the table every year. Beyond the match, the pre-tax contribution reduces your current taxable income, and the 2024 contribution limit of $23,000 allows substantial tax-advantaged savings.",
    howRayHelps:
      "Ray can track your 401(k) contributions and growth alongside your other accounts. Ask `ray \"am I on track to max out my 401(k) this year?\"` to see your year-to-date contributions vs. the annual limit.",
    example:
      "On a $90,000 salary with a 50% employer match up to 6%: contributing 6% ($5,400) earns a $2,700 match — that's a guaranteed 50% return before any investment gains.",
    relatedTerms: ["roth-ira", "tax-bracket", "compound-interest", "asset-allocation", "gross-income"],
    metaTitle: "What is a 401(k)? | Ray Finance",
    metaDescription:
      "A 401(k) is an employer-sponsored retirement plan with tax advantages and employer matching. Learn contribution limits and how Ray tracks yours.",
  },
];

export function getTermBySlug(slug: string): GlossaryTerm | undefined {
  return glossaryTerms.find((t) => t.slug === slug);
}
