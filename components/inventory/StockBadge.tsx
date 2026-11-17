"use client";

interface StockBadgeProps {
  current: number;
  minimum: number;
  unit: string;
}

export default function StockBadge({ current, minimum, unit }: StockBadgeProps) {
  let colorClass: string;
  let badgeColor: string;

  if (current === 0) {
    colorClass = "red";
    badgeColor = "stock-critical";
  } else if (current <= minimum) {
    colorClass = "amber";
    badgeColor = "stock-low";
  } else {
    colorClass = "green";
    badgeColor = "stock-ok";
  }

  return (
    <span className={`badge ${colorClass}`}>
      {current} {unit}
    </span>
  );
}
