import type { ReactNode } from "react"
import { cx } from "../lib/cx.ts"

export type CodeTone = "night" | "nightInset" | "panel"

const toneClass: Record<CodeTone, string> = {
  night: "bg-night text-night-text",
  nightInset: "bg-night-code text-night-text",
  panel: "bg-panel text-ink",
}

export const CodeBlock = ({
  children,
  tone = "night",
  className,
  label,
}: {
  children: ReactNode
  tone?: CodeTone
  className?: string
  label?: string
}) => (
  <pre
    aria-label={label}
    className={cx("overflow-x-auto whitespace-pre rounded-control px-5 py-4.5 font-mono text-code", toneClass[tone], className)}
  >
    <code>{children}</code>
  </pre>
)
