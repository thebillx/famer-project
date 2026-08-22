import { useId } from "react";
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
    neutral: "as-badge-neutral",
    success: "as-badge-success",
    warning: "as-badge-warning",
    danger: "as-badge-danger",
    satellite: "as-badge-satellite"
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
    neutral: "as-metric-neutral",
    success: "as-metric-success",
    warning: "as-metric-warning",
    satellite: "as-metric-satellite"
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
  action,
  role
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <Card premium className="p-8 text-center">
      <div role={role}>
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-[var(--as-surface-soft)] text-lg font-bold text-[var(--as-primary)]">
          AS
        </div>
        <h2 className="text-xl font-bold text-[var(--as-ink)]">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-[var(--as-ink-muted)]">{description}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </Card>
  );
}

export function LoadingBlock({ label = "Loading..." }: { label?: string }) {
  return (
    <Card className="space-y-4 p-5" aria-label={label}>
      <div role="status" aria-live="polite" aria-busy="true" className="text-sm font-semibold text-[var(--as-ink-muted)]">
        {label}
      </div>
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
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const generatedId = useId();
  const inputId = props.id ?? `as-input-${generatedId.replaceAll(":", "")}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="as-field">
      <label className="as-label" htmlFor={inputId}>
        {label}
        {props["aria-required"] ? <span aria-hidden="true"> *</span> : null}
      </label>
      <input
        {...props}
        id={inputId}
        aria-describedby={describedBy}
        aria-invalid={error ? "true" : props["aria-invalid"]}
        data-state={error ? "error" : undefined}
        className={`as-input ${props.className ?? ""}`}
      />
      <span className="as-field-message">
        {hint ? (
          <span id={hintId} className="as-field-hint">
            {hint}
          </span>
        ) : null}
        {error ? (
          <span id={errorId} className="as-field-error" role="alert">
            {error}
          </span>
        ) : null}
      </span>
    </div>
  );
}
