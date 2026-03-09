export function resolvePeriod(period: string): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (period) {
    case "this_month":
      return { start: new Date(y, m, 1).toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    case "last_month":
      return { start: new Date(y, m - 1, 1).toISOString().slice(0, 10), end: new Date(y, m, 0).toISOString().slice(0, 10) };
    case "this_year":
      return { start: new Date(y, 0, 1).toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    case "last_30":
      return { start: shiftDays(now, -30).toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    case "last_90":
      return { start: shiftDays(now, -90).toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    default: {
      const parts = period.split(":");
      if (parts.length === 2) return { start: parts[0], end: parts[1] };
      throw new Error(`Unknown period: ${period}. Use this_month, last_month, this_year, last_30, last_90, or START:END`);
    }
  }
}

export function shiftDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function simulatePayoff(balance: number, annualRate: number, monthlyPayment: number) {
  const monthlyRate = annualRate / 100 / 12;
  let remaining = balance;
  let totalInterest = 0;
  const schedule: { month: number; payment: number; principal: number; interest: number; remaining: number }[] = [];
  let month = 0;
  while (remaining > 0.01 && month < 600) {
    month++;
    const interest = remaining * monthlyRate;
    const payment = Math.min(monthlyPayment, remaining + interest);
    const principal = payment - interest;
    remaining -= principal;
    totalInterest += interest;
    schedule.push({ month, payment: Math.round(payment * 100) / 100, principal: Math.round(principal * 100) / 100, interest: Math.round(interest * 100) / 100, remaining: Math.round(Math.max(0, remaining) * 100) / 100 });
  }
  return { months: month, totalInterest: Math.round(totalInterest * 100) / 100, schedule };
}
