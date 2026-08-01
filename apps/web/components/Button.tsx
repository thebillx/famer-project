import type React from "react";

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-[#173f35] text-white hover:bg-[#102d26]",
    secondary: "border border-[#b8c5b0] bg-white text-[#173f35] hover:bg-[#eef5ec]",
    danger: "bg-[#8f2435] text-white hover:bg-[#741b2a]"
  };
  return (
    <button
      {...props}
      className={`h-11 rounded-md px-4 font-medium disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}
