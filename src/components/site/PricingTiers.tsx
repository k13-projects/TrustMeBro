"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { BrushText } from "@/components/site/BrushText";
import { GoldButton } from "@/components/site/GoldButton";
import { HandArrow } from "@/components/site/HandArrow";
import { cn } from "@/lib/utils";

const TIERS = [
  {
    name: "Weekly",
    price: "$19",
    cadence: "/week",
    href: "/login",
    cta: "Get Weekly Access",
    popular: false,
    perks: [
      "Premium Picks",
      "Detailed Analysis",
      "Community Access",
      "Cancel Anytime",
    ],
  },
  {
    name: "Monthly",
    price: "$49",
    cadence: "/month",
    href: "/login",
    cta: "Get Monthly Access",
    popular: true,
    perks: [
      "Premium Picks",
      "Detailed Analysis",
      "Community Access",
      "Cancel Anytime",
    ],
  },
] as const;

export function PricingTiers() {
  return (
    <section
      id="pricing"
      className="mx-auto max-w-7xl px-4 sm:px-6 py-16 grid gap-10 lg:grid-cols-[0.85fr_1.6fr] items-start"
    >
      <div className="space-y-4 relative">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Pricing
        </p>
        <h2 className="font-display italic uppercase leading-[0.9] text-[clamp(2.6rem,6vw,4.5rem)] text-foreground/95">
          Unlock The
          <br />
          <BrushText className="text-[1.06em]">Edge</BrushText>
        </h2>
        <p className="text-foreground/70 max-w-sm">
          Stop guessing. Start winning.
        </p>
        <HandArrow
          aria-hidden
          className="hidden lg:block absolute -right-6 top-20 w-32 h-20 text-primary/80"
          rotate={8}
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        {TIERS.map((tier, i) => (
          <motion.div
            key={tier.name}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ delay: i * 0.1, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "card-tmb relative p-6 space-y-5",
              tier.popular && "pulse-gold border-primary/60"
            )}
          >
            {tier.popular && (
              <span className="absolute -top-3 right-5 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-[0.16em] px-3 py-1 rounded-full shadow-[0_8px_24px_-6px_rgba(255,184,0,0.6)]">
                Most Popular
              </span>
            )}
            <div className="flex items-baseline gap-2">
              <p className="font-display italic uppercase text-2xl tracking-wide">
                {tier.name}
              </p>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-numeric text-5xl text-foreground tabular-nums leading-none">
                {tier.price}
              </span>
              <span className="text-sm text-muted-foreground">
                {tier.cadence}
              </span>
            </div>
            <ul className="space-y-2.5 text-sm">
              {tier.perks.map((perk) => (
                <li key={perk} className="flex items-center gap-2">
                  <Check size={16} className="text-primary shrink-0" />
                  <span className="text-foreground/85">{perk}</span>
                </li>
              ))}
            </ul>
            <GoldButton
              href={tier.href}
              variant={tier.popular ? "solid" : "outline"}
              size="md"
              className="w-full"
            >
              {tier.cta}
            </GoldButton>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
