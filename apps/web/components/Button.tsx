import type React from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "as-button-primary",
  secondary: "as-button-secondary",
  danger: "as-button-danger",
  ghost: "as-button-ghost"
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "as-button-sm",
  md: "as-button-md",
  lg: "as-button-lg"
};

export function buttonClassName({
  variant = "primary",
  size = "md",
  className = ""
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return `as-button ${sizeClasses[size]} ${variantClasses[variant]} ${className}`.trim();
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  loadingLabel = "กำลังดำเนินการ…",
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingLabel?: string;
}) {
  const unavailable = Boolean(disabled || isLoading);

  return (
    <button
      {...props}
      aria-busy={isLoading || undefined}
      disabled={unavailable}
      className={buttonClassName({ variant, size, className: props.className })}
    >
      <span className="as-button-label" aria-hidden={isLoading || undefined}>
        {children}
      </span>
      {isLoading ? (
        <span className="as-button-loading" role="status">
          <span className="as-button-spinner" aria-hidden="true" />
          {loadingLabel}
        </span>
      ) : null}
    </button>
  );
}
