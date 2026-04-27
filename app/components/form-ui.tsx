"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";

type Variant = "primary" | "secondary" | "chip" | "chip-dark" | "ghost" | "icon-soft" | "icon-dark" | "icon-danger";

const variantClasses: Record<Variant, string> = {
  primary: "button-primary",
  secondary: "button-secondary",
  chip:
    "w-auto rounded-full border border-[rgba(37,99,235,0.14)] bg-[color:var(--accent-soft)] px-3.5 py-2 text-xs font-semibold text-[color:var(--accent-strong)] shadow-[0_10px_18px_rgba(37,99,235,0.08)]",
  "chip-dark":
    "w-auto rounded-full border border-white/10 bg-[linear-gradient(135deg,#111827,#1d4ed8)] px-3.5 py-2 text-xs font-semibold text-white shadow-[0_14px_24px_rgba(29,78,216,0.18)]",
  ghost:
    "w-auto rounded-full border border-black/10 bg-white/85 px-3.5 py-2 text-xs font-semibold text-[color:var(--muted-strong)] shadow-[0_8px_16px_rgba(15,23,42,0.05)]",
  "icon-soft": "icon-action-button icon-action-button--soft",
  "icon-dark": "icon-action-button icon-action-button--dark",
  "icon-danger": "icon-action-button icon-action-button--danger",
};

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  className = "",
  disabled,
  ...props
}: {
  children: ReactNode;
  pendingText?: ReactNode;
  variant?: Variant;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">) {
  const { pending } = useFormStatus();
  const isDisabled = Boolean(disabled) || pending;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-busy={pending}
      className={`${variantClasses[variant]} ${isDisabled ? "cursor-wait opacity-70" : ""} ${className}`.trim()}
      {...props}
    >
      {pending ? pendingText ?? "Procesando..." : children}
    </button>
  );
}
