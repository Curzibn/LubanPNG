import type { InputHTMLAttributes } from "react"
import { cx } from "../lib/cx.ts"

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string
  error?: string | null
  className?: string
}

export const TextField = ({ label, error, className, id, ...rest }: TextFieldProps) => {
  const inputId = id ?? `field-${label}`
  const errorId = `${inputId}-error`
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label htmlFor={inputId} className="text-label font-medium text-ink">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cx(
          "h-control-lg w-full rounded-control border-frame bg-surface px-3.5 text-body text-ink transition-colors placeholder:text-ink-secondary disabled:opacity-disabled",
          error ? "border-vermilion" : "border-ink",
        )}
        {...rest}
      />
      {error && (
        <p id={errorId} role="alert" className="text-label text-vermilion">
          {error}
        </p>
      )}
    </div>
  )
}
