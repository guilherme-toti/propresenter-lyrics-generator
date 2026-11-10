"use client";

import type { ReactNode } from "react";
import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/cn";

interface DismissibleAlertProps {
  children: ReactNode;
  onDismiss: () => void;
  /** "boxed" stands alone in a panel; "inline" sits in a narrow column, such as under a screen. */
  variant?: "boxed" | "inline";
  className?: string;
}

/** A problem the user can read and close. The icon and the words carry it, not just the red. */
export function DismissibleAlert({ children, onDismiss, variant = "boxed", className }: DismissibleAlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-1.5 text-sm text-red-700",
        variant === "boxed" && "gap-2 rounded-xl border border-line bg-white px-3 py-2.5",
        className,
      )}
    >
      <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0 text-red-600" />
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar aviso"
        className="shrink-0 rounded-full p-0.5 text-ink/40 transition-colors hover:text-ink"
      >
        <X size={14} />
      </button>
    </div>
  );
}
