import Link from "next/link";
import Image from "next/image";
import { Camera, MessageCircle, Play, Send } from "lucide-react";

const COLS = [
  {
    heading: "Company",
    links: [
      { href: "/", label: "About Us" },
      { href: "/score", label: "Results" },
      { href: "/history", label: "History" },
      { href: "/engine", label: "Engine" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/legal/terms", label: "Terms of Service" },
      { href: "/legal/privacy", label: "Privacy Policy" },
      { href: "/legal/disclaimer", label: "Disclaimer" },
    ],
  },
];

const SOCIALS: Array<{
  href: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  letter?: string;
}> = [
  { href: "https://x.com", label: "X", Icon: () => null, letter: "𝕏" },
  { href: "https://instagram.com", label: "Instagram", Icon: Camera },
  { href: "https://discord.com", label: "Discord", Icon: MessageCircle },
  { href: "https://t.me", label: "Telegram", Icon: Send },
  { href: "https://youtube.com", label: "YouTube", Icon: Play },
];

export function Footer() {
  return (
    <footer className="relative z-10 mt-24 border-t border-border/70">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-14 grid gap-12 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <div className="space-y-5">
          <Image
            src="/Design/Logo 2.png"
            alt="TrustMeBro"
            width={120}
            height={120}
            className="rounded-2xl logo-float motion-reduce:animate-none"
          />
          <p className="font-display text-2xl leading-[0.95] tracking-wide uppercase italic">
            In Data
            <br />
            <span className="text-primary">We Trust</span>
          </p>
        </div>

        {COLS.map((col) => (
          <div key={col.heading} className="space-y-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {col.heading}
            </h3>
            <ul className="space-y-2 text-sm">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-foreground/70 hover:text-primary transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Follow Us
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {SOCIALS.map(({ href, label, Icon, letter }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                className="grid place-items-center size-10 rounded-full border border-border/80 text-foreground/70 hover:text-primary hover:border-primary/50 hover:-translate-y-0.5 transition"
              >
                {letter ? (
                  <span className="text-sm font-bold leading-none">{letter}</span>
                ) : (
                  <Icon size={16} />
                )}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-border/70">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-5 flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-3">
          <p>© 2026 TrustMeBro. All rights reserved.</p>
          <p>Data: ESPN · NBA only (more sports coming)</p>
        </div>
      </div>
    </footer>
  );
}
