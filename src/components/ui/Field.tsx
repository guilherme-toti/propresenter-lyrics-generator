import { type InputHTMLAttributes, type TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/35 outline-none transition-shadow focus:ring-2 focus:ring-accent/30 focus:border-accent",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full resize-none rounded-lg border border-line bg-white px-3 py-2 font-mono text-[13px] leading-relaxed text-ink placeholder:text-ink/35 outline-none transition-shadow focus:ring-2 focus:ring-accent/30 focus:border-accent",
        className,
      )}
      {...props}
    />
  ),
);
TextArea.displayName = "TextArea";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-xs font-medium text-ink/60", className)} {...props} />;
}
