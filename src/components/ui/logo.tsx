import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("h-8 w-8", className)} aria-hidden>
      <defs>
        <linearGradient id="syncly-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14b8a6" />
          <stop offset="1" stopColor="#7c5cff" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#syncly-g)" />
      <path d="M10 19.5c0 2 2.2 3.2 6 3.2s6-1.3 6-3.4c0-4.6-11.6-2.4-11.6-7 0-2 2.2-3.3 5.6-3.3 3 0 5 1 5.6 2.6" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {!collapsed && <span className="font-display text-[17px] font-bold tracking-tight text-ink">Syncly</span>}
    </span>
  );
}
