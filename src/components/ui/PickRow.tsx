import { Loader2 } from "lucide-react";

interface PickRowProps {
  title: string;
  subtitle: string;
  /** Shown at the far right — e.g. the recording's language. Replaced by a spinner while `busy`. */
  trailing?: string;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/** One choice in a picker list: the song pickers in "Nova música", "Trocar gravação" and
 * "Importar do ProPresenter" all render their options with it. */
export function PickRow({ title, subtitle, trailing, busy = false, disabled = false, onClick }: PickRowProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-baseline justify-between gap-3 rounded-lg border border-line bg-white px-3 py-2 text-left transition-colors hover:border-accent hover:bg-accent/5 disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm text-ink">{title}</span>
        <span className="block truncate text-xs text-ink/55">{subtitle}</span>
      </span>
      {busy ? (
        <Loader2 size={14} className="shrink-0 animate-spin" />
      ) : (
        trailing && <span className="shrink-0 text-[13px] uppercase text-ink/40">{trailing}</span>
      )}
    </button>
  );
}
