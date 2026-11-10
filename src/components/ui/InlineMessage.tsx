"use client";

import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

type Tone = "error" | "success" | "info";
type Variant = "inline" | "boxed";

interface ToneStyle {
  icon: LucideIcon;
  role: "alert" | "status";
  /** A boxed message is read on its own, so its neutral copy isn't dimmed like a note under a field. */
  text: Record<Variant, string>;
  iconColor?: string;
}

const TONES: Record<Tone, ToneStyle> = {
  error: {
    icon: AlertCircle,
    role: "alert",
    text: { inline: "text-red-700", boxed: "text-red-700" },
    iconColor: "text-red-600",
  },
  success: { icon: CheckCircle2, role: "status", text: { inline: "text-ink/70", boxed: "text-ink" } },
  info: { icon: Info, role: "status", text: { inline: "text-ink/70", boxed: "text-ink" }, iconColor: "text-ink/60" },
};

interface InlineMessageProps {
  tone: Tone;
  children: ReactNode;
  /** Adds a close button. Leave it out for a message that goes away by itself. */
  onDismiss?: () => void;
  /** "inline" sits right under what it's about; "boxed" stands alone as a card, such as over a button. */
  variant?: Variant;
  /** Replaces the tone's icon when a more specific one says it better. */
  icon?: LucideIcon;
  className?: string;
}

/** What just happened, in a line or two. The icon and the words carry the tone, never the colour alone. */
export function InlineMessage({ tone, children, onDismiss, variant = "inline", icon, className }: InlineMessageProps) {
  const style = TONES[tone];
  const Icon = icon ?? style.icon;

  return (
    <div
      role={style.role}
      className={cn(
        "flex items-start gap-1.5 text-sm",
        style.text[variant],
        variant === "boxed" && "gap-2 rounded-xl border border-line bg-white px-3 py-2.5",
        className,
      )}
    >
      <Icon size={16} aria-hidden className={cn("mt-0.5 shrink-0", style.iconColor)} />
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar aviso"
          className="shrink-0 rounded-full p-0.5 text-ink/40 transition-colors hover:text-ink"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
