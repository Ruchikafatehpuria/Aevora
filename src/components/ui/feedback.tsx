import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  error: { cls: "bg-danger-soft text-danger", Icon: AlertCircle },
  success: { cls: "bg-success-soft text-success", Icon: CheckCircle2 },
  info: { cls: "bg-primary-soft text-primary", Icon: Info },
} as const;

export function Alert({ tone = "info", children, className }: { tone?: keyof typeof tones; children: React.ReactNode; className?: string }) {
  const { cls, Icon } = tones[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-2.5 rounded-lg px-3.5 py-3 text-sm", cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} aria-hidden />;
}

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: "neutral" | "primary" | "accent" | "warning"; className?: string }) {
  const t = {
    neutral: "bg-surface-2 text-ink-2",
    primary: "bg-primary-soft text-primary",
    accent: "bg-accent-soft text-accent",
    warning: "bg-warning-soft text-warning",
  }[tone];
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", t, className)}>{children}</span>;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/25 to-accent/25 blur-xl" aria-hidden />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-surface">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
      <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-2">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
