import { useEffect, useRef, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react"
import { cx } from "../../lib/cx.ts"

export const OTP_LENGTH = 6

const digitsOnly = (text: string): string => text.replace(/\D/g, "")

export const OtpInput = ({
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = false,
}: {
  value: string
  onChange: (value: string) => void
  onComplete?: (code: string) => void
  disabled?: boolean
  autoFocus?: boolean
}) => {
  const inputs = useRef<Array<HTMLInputElement | null>>([])
  const activeIndex = Math.min(value.length, OTP_LENGTH - 1)

  const focusBox = (index: number) => {
    inputs.current[Math.max(0, Math.min(OTP_LENGTH - 1, index))]?.focus()
  }

  useEffect(() => {
    if (autoFocus && !disabled) focusBox(value.length)
  }, [autoFocus, disabled, value.length])

  const commit = (next: string) => {
    const trimmed = next.slice(0, OTP_LENGTH)
    onChange(trimmed)
    focusBox(trimmed.length)
    if (trimmed.length === OTP_LENGTH) onComplete?.(trimmed)
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const typed = digitsOnly(event.target.value)
    if (typed === "") return
    commit(value + typed)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault()
      const next = value.slice(0, -1)
      onChange(next)
      focusBox(next.length)
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const pasted = digitsOnly(event.clipboardData.getData("text"))
    if (pasted === "") return
    commit(pasted.length >= OTP_LENGTH ? pasted : value + pasted)
  }

  return (
    <div className="grid grid-cols-6 gap-2 md:gap-2.5" role="group" aria-label="6 位验证码">
      {Array.from({ length: OTP_LENGTH }, (_, index) => {
        const digit = value[index] ?? ""
        const filled = digit !== ""
        const active = index === activeIndex && value.length < OTP_LENGTH
        return (
          <input
            key={index}
            ref={(element) => {
              inputs.current[index] = element
            }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={OTP_LENGTH}
            value={digit}
            disabled={disabled}
            aria-label={`验证码第 ${index + 1} 位`}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => {
              if (index !== activeIndex) focusBox(activeIndex)
            }}
            className={cx(
              "h-control-xl w-full min-w-0 rounded-control border-frame bg-surface text-center font-mono text-otp font-semibold text-ink caret-transparent transition-colors disabled:opacity-disabled",
              filled ? "border-ink" : active ? "border-vermilion" : "border-hairline",
            )}
          />
        )
      })}
    </div>
  )
}
