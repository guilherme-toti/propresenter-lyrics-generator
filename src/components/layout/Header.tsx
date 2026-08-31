import { Music2 } from "lucide-react";

export function Header() {
  return (
    <header className="flex items-center gap-2 border-b border-line bg-cream-50 px-6 py-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-cream-50">
        <Music2 size={16} />
      </div>
      <div className="leading-tight">
        <p className="font-display text-base font-semibold text-ink">Lyrics Studio</p>
        <p className="text-[11px] text-ink/45">Bilingual lyrics → ProPresenter</p>
      </div>
    </header>
  );
}
