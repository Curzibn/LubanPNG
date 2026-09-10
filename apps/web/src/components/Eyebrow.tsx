import type { ReactNode } from "react"
import { cx } from "../lib/cx.ts"

type EyebrowTone = "paper" | "night"
type EyebrowSize = "sm" | "md" | "responsive"

const sizeClass: Record<EyebrowSize, string> = {
  sm: "text-label-sm",
  md: "text-label",
  responsive: "text-label-sm md:text-label",
}

export const Eyebrow = ({
  children,
  tone = "paper",
  size = "md",
  className,
}: {
  children: ReactNode
  tone?: EyebrowTone
  size?: EyebrowSize
  className?: string
}) => (
  <p
    className={cx(
      "font-mono tracking-eyebrow",
      sizeClass[size],
      tone === "night" ? "text-night-muted" : "text-ink-secondary",
      className,
    )}
  >
    {children}
  </p>
)
