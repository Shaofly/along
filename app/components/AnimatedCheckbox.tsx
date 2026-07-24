import type { InputHTMLAttributes } from "react";

type AnimatedCheckboxProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  markClassName?: string;
};

export function AnimatedCheckbox({
  className,
  markClassName,
  ...props
}: AnimatedCheckboxProps) {
  return (
    <>
      <input
        {...props}
        className={["animated-checkbox-input", className]
          .filter(Boolean)
          .join(" ")}
        type="checkbox"
      />
      <span
        aria-hidden="true"
        className={["animated-checkbox-mark", "t-check", markClassName]
          .filter(Boolean)
          .join(" ")}
      >
        <svg aria-hidden="true" fill="none" viewBox="0 0 10.1668 10.1668">
          <path
            d="M1 5.52L3.92 9.17L9.17 1"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </>
  );
}
