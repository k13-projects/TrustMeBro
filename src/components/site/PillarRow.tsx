import { BarChart3, Crosshair, Trophy, Users } from "lucide-react";

const PILLARS = [
  { Icon: BarChart3, title: "Data Driven", note: "Numbers don’t lie." },
  { Icon: Crosshair, title: "Sharp Analysis", note: "We find the edge." },
  { Icon: Trophy, title: "Proven Results", note: "Winners know." },
  { Icon: Users, title: "Community First", note: "We win together." },
] as const;

export function PillarRow() {
  return (
    <section className="relative">
      {/* hairline gradient fades — flows into surrounding sections */}
      <div
        aria-hidden
        className="absolute inset-x-[8%] top-0 h-px pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,184,0,0.22) 50%, transparent 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-[8%] bottom-0 h-px pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,184,0,0.22) 50%, transparent 100%)",
        }}
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-y-7 gap-x-6">
        {PILLARS.map(({ Icon, title, note }) => (
          <div key={title} className="flex items-center gap-3">
            <Icon
              size={22}
              strokeWidth={2.25}
              className="text-primary shrink-0"
            />
            <div>
              <div className="font-display italic uppercase text-[15px] tracking-wide leading-none">
                {title}
              </div>
              <div className="text-xs text-muted-foreground mt-1">{note}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
