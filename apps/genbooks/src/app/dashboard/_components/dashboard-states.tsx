import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
};

export function DashboardEmptyState({
  icon: Icon,
  title,
  description,
  actionHref,
  actionLabel,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`content-card rise-in flex min-h-52 w-full flex-col items-center justify-center gap-3 p-6 text-center ${className}`}
    >
      <div className="field-shell rounded-full p-3 text-pirrot-blue-700">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="text-xl font-bold text-info-950">{title}</h3>
      <p className="max-w-lg text-sm text-info-700">{description}</p>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="btn-soft px-4 py-2 text-sm">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function DashboardSkeleton({
  rows = 4,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={`content-card w-full p-4 ${className}`}>
      <div className="skeleton mb-4 h-7 w-40" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="skeleton h-12 w-full"
          />
        ))}
      </div>
    </div>
  );
}
