import type React from "react";

export function Card({
  children,
  premium = false,
  className = ""
}: {
  children: React.ReactNode;
  premium?: boolean;
  className?: string;
}) {
  return (
    <section className={`${premium ? "as-card-premium" : "as-card"} rounded-[var(--as-radius-lg)] ${className}`}>
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = "neutral"
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "satellite";
}) {
  const tones = {
    neutral: "text-[var(--as-ink-muted)]",
    success: "text-[var(--as-success)]",
    warning: "text-[var(--as-warning)]",
    danger: "text-[var(--as-danger)]",
    satellite: "text-[var(--as-satellite)]"
  };
  return <span className={`as-pill ${tones[tone]}`}>{children}</span>;
}

export function MetricCard({
  label,
  value,
  detail,
  tone = "neutral"
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "success" | "warning" | "satellite";
}) {
  const toneClass = {
    neutral: "bg-[var(--as-surface-soft)] text-[var(--as-primary)]",
    success: "bg-[#ecf8ef] text-[var(--as-success)]",
    warning: "bg-[var(--as-amber-soft)] text-[var(--as-warning)]",
    satellite: "bg-[var(--as-blue-soft)] text-[var(--as-satellite)]"
  };
  return (
    <Card className="p-4">
      <div className={`mb-4 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${toneClass[tone]}`}>
        {label}
      </div>
      <p className="as-number text-2xl font-bold text-[var(--as-ink)]">{value}</p>
      {detail ? <p className="mt-1 text-sm text-[var(--as-ink-muted)]">{detail}</p> : null}
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card premium className="p-8 text-center">
      <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[var(--as-surface-soft)] text-lg font-bold text-[var(--as-primary)]">
        AS
      </div>
      <h2 className="text-xl font-bold text-[var(--as-ink)]">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-[var(--as-ink-muted)]">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </Card>
  );
}

export function LoadingBlock({ label = "Loading..." }: { label?: string }) {
  return (
    <Card className="space-y-4 p-5" aria-label={label}>
      <div className="as-skeleton h-5 w-40 rounded-full" />
      <div className="as-skeleton h-20 rounded-[var(--as-radius-md)]" />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="as-skeleton h-16 rounded-[var(--as-radius-md)]" />
        <div className="as-skeleton h-16 rounded-[var(--as-radius-md)]" />
        <div className="as-skeleton h-16 rounded-[var(--as-radius-md)]" />
      </div>
    </Card>
  );
}

export function FormInput({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="as-label">{label}</span>
      <input {...props} className={`as-input ${props.className ?? ""}`} />
      {hint ? <span className="mt-2 block text-sm text-[var(--as-ink-muted)]">{hint}</span> : null}
    </label>
  );
}
