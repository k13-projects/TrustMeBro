import { cx } from "@/lib/design/tokens";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "strong";
  sheen?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  as?: keyof Pick<React.JSX.IntrinsicElements, "div" | "section" | "article">;
};

const paddings = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

export function Card({
  variant = "default",
  sheen = false,
  padding = "md",
  as: Tag = "div",
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <Tag
      className={cx(
        variant === "strong" ? "glass-strong" : "glass",
        sheen && "glass-sheen",
        "rounded-2xl",
        paddings[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  eyebrow,
  title,
  description,
  trailing,
  className,
}: {
  eyebrow?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cx("flex items-start justify-between gap-3 flex-wrap", className)}
    >
      <div className="space-y-1">
        {eyebrow ? (
          <p className="text-[11px] font-medium tracking-[0.22em] uppercase text-foreground/45">
            {eyebrow}
          </p>
        ) : null}
        {title ? (
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight">
            {title}
          </h2>
        ) : null}
        {description ? (
          <p className="text-sm text-foreground/55">{description}</p>
        ) : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </header>
  );
}
