export function AuthHeading({ title, subtitle }: { title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-ink-2">{subtitle}</p>}
    </div>
  );
}
