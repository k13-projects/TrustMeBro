// Page header for the /football section — matches the app's display-font
// heading style (see SectionHeading) but renders an h1 for the page title.
export function FootballHeader({ title }: { title: string }) {
  return (
    <header>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        ⚽ World Cup
      </p>
      <h1 className="mt-1 font-display uppercase text-[clamp(2rem,4.4vw,3.4rem)] leading-[0.95] tracking-[-0.01em]">
        {title}
      </h1>
    </header>
  );
}
