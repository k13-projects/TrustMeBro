import { setSport } from "@/lib/sports/actions";
import { SPORTS, SPORT_ORDER } from "@/lib/sports/registry";
import type { Sport } from "@/lib/sports/types";

// The single global sport switch. Each option submits a server action that
// sets the `tmb:sport` cookie (so SSR agrees) and redirects to that sport's
// home — also works with JS disabled. Scopes sections, scoreboard, coupons.
export function SportToggle({ active }: { active: Sport }) {
  return (
    <div
      role="group"
      aria-label="Sport"
      className="inline-flex items-center rounded-full border border-border/70 bg-background/60 p-0.5"
    >
      {SPORT_ORDER.map((sport) => {
        const meta = SPORTS[sport];
        const isActive = sport === active;
        return (
          <form key={sport} action={setSport.bind(null, sport)}>
            <button
              type="submit"
              aria-pressed={isActive}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span aria-hidden>{meta.emoji}</span>
              <span className="hidden sm:inline">{meta.label}</span>
            </button>
          </form>
        );
      })}
    </div>
  );
}
