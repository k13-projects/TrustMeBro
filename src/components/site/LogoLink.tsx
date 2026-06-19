"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

// Logo link with "back-to-top" behavior when the user is already on /.
// On any other route, the Link behaves as normal (Next.js scrolls to top
// on navigation by default, which feels right for going home from
// elsewhere). Smooth easing comes from `html { scroll-behavior: smooth }`
// in globals.css — we just kick off the scroll programmatically.
export function LogoLink() {
  const pathname = usePathname();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (pathname === "/") {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <Link
      href="/"
      onClick={handleClick}
      className="group relative flex shrink-0 items-center gap-3"
      aria-label="TrustMeBro home"
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-primary/30 blur-xl opacity-0 group-hover:opacity-80 transition-opacity duration-500 pointer-events-none"
      />
      <Image
        src="/Design/logo-mark.png"
        alt="TrustMeBro"
        width={200}
        height={200}
        priority
        sizes="(max-width: 640px) 72px, 116px"
        className="relative size-[4.5rem] shrink-0 sm:size-[7.2rem] logo-float transition-transform duration-300 ease-out group-hover:rotate-[-5deg] group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:transform-none motion-reduce:animate-none"
      />
    </Link>
  );
}
