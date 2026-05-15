import { forwardRef, useId } from "react";
import { cx, focusRingInset } from "@/lib/design/tokens";

type InputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "className"
> & {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  className?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, label, hint, error, required, ...rest },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? `input-${reactId}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      {label ? (
        <label
          htmlFor={inputId}
          className="block text-[11px] uppercase tracking-widest text-foreground/55"
        >
          {label}
          {required ? <span aria-hidden className="text-rose-300"> *</span> : null}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(
          "mt-1 w-full rounded-xl bg-white/5 px-3 py-2 text-sm outline-none transition-colors",
          "border",
          error
            ? "border-rose-400/50 focus:border-rose-300"
            : "border-white/10 focus:border-white/25",
          focusRingInset,
        )}
        {...rest}
      />
      {hint && !error ? (
        <p id={hintId} className="mt-1 text-[11px] text-foreground/50">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="mt-1 text-[12px] text-rose-300"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
});
