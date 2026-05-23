import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip: string;
  tooltipPlacement?: "top" | "bottom";
  children: ReactNode;
};

export function IconButton({
  tooltip,
  tooltipPlacement = "bottom",
  children,
  className,
  disabled,
  type = "button",
  "aria-label": ariaLabel,
  ...props
}: Props) {
  return (
    <span
      className={`icon-btn-wrap${disabled ? " is-disabled" : ""}`}
      data-tooltip={tooltip}
      data-tooltip-placement={tooltipPlacement}
    >
      <button
        type={type}
        className={className ?? "btn icon-btn"}
        disabled={disabled}
        aria-label={ariaLabel ?? tooltip}
        {...props}
      >
        {children}
      </button>
    </span>
  );
}
