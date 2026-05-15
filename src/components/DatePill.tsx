import Link from "next/link";

export function DatePill({
  href,
  label,
  emphasis,
}: {
  href: string;
  label: string;
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3.5 py-1.5 transition-colors ${
        emphasis
          ? "bg-white/10 text-foreground"
          : "text-foreground/65 hover:text-foreground hover:bg-white/5"
      }`}
    >
      {label}
    </Link>
  );
}
