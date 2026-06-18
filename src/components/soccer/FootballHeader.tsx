import { Mascot } from "@/components/site/Mascot";

// Page header for the /football section — matches the app's display-font
// heading style (see SectionHeading) but renders an h1 for the page title.
// `mascot` opts into the brand mascot accent (used on the World Cup home);
// subpage headers leave it off so the character doesn't repeat everywhere.
export function FootballHeader({
  title,
  mascot = false,
}: {
  title: string;
  mascot?: boolean;
}) {
  return (
    <header className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          ⚽ World Cup
        </p>
        <h1 className="mt-1 font-display uppercase text-[clamp(2rem,4.4vw,3.4rem)] leading-[0.95] tracking-[-0.01em]">
          {title}
        </h1>
      </div>
      {mascot ? (
        <div className="relative aspect-square w-24 shrink-0 sm:w-32 lg:w-44">
          <div
            aria-hidden
            className="absolute inset-[14%] rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(40% 40% at 50% 50%, rgba(255,184,0,0.28), transparent 72%)",
            }}
          />
          <Mascot
            variant="full"
            bob
            priority
            size={400}
            className="relative h-auto w-full"
          />
        </div>
      ) : null}
    </header>
  );
}
