interface BudgetBadgeProps {
  amount: number;
}

function formatBudget(n: number | null | undefined): string {
  const num = Number(n ?? 0) || 0;
  if (num >= 1_000_000) return '$' + (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 10_000) return '$' + (num / 1_000).toFixed(1) + 'K';
  return '$' + num.toLocaleString();
}

export default function BudgetBadge({ amount }: BudgetBadgeProps) {
  return (
    <span className="inf-dash-budget-badge">
      {formatBudget(amount)}
    </span>
  );
}
