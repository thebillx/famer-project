import type React from "react";

export function Button({
  children,
  variant = "primary",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}) {
  const styles = {
    primary:
      "border border-[var(--as-primary)] bg-[var(--as-primary)] text-white shadow-[var(--as-shadow-sm)] hover:bg-[var(--as-primary-strong)]",
    secondary:
      "border border-[var(--as-border)] bg-white/80 text-[var(--as-primary)] hover:border-[var(--as-border-strong)] hover:bg-[var(--as-surface-soft)]",
    danger:
      "border border-[var(--as-danger)] bg-[var(--as-danger)] text-white shadow-[var(--as-shadow-sm)] hover:brightness-95",
    ghost: "border border-transparent bg-transparent text-[var(--as-primary)] hover:bg-[var(--as-surface-soft)]"
  };
  const sizes = {
    sm: "min-h-9 px-3 text-sm",
    md: "min-h-11 px-4 text-sm",
    lg: "min-h-12 px-5 text-base"
  };
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--as-radius-sm)] font-semibold transition duration-200 ease-out active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${sizes[size]} ${styles[variant]} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
