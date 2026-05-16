import { cn } from "@/lib/utils";

type Props = {
  eyebrow?: string;
  title: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
};

export function SectionHeading({ eyebrow, title, trailing, className }: Props) {
  return (
    <div
      className={cn(
        "flex items-end justify-between gap-4 flex-wrap mb-7",
        className
      )}
    >
      <div>
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-1 font-display uppercase text-[clamp(2rem,4.4vw,3.4rem)] leading-[0.95] tracking-[-0.01em] text-foreground">
          {title}
        </h2>
      </div>
      {trailing ? <div className="mb-1">{trailing}</div> : null}
    </div>
  );
}
