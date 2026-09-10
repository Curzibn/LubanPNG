import type { ReactNode } from "react"
import { cx } from "../lib/cx.ts"
import { CloseIcon } from "./icons.tsx"

export type NoticeTone = "warning" | "error" | "info" | "success"

const toneClass: Record<NoticeTone, string> = {
  warning: "border-amber bg-amber-soft",
  error: "border-vermilion bg-vermilion-soft",
  info: "border-hairline bg-panel",
  success: "border-jade bg-jade-soft",
}

export const Notice = ({
  children,
  tone = "info",
  onDismiss,
  className,
}: {
  children: ReactNode
  tone?: NoticeTone
  onDismiss?: () => void
  className?: string
}) => (
  <div
    role={tone === "error" ? "alert" : "status"}
    className={cx(
      "flex items-start justify-between gap-3 rounded-control border-thin px-4 py-3 text-ui leading-relaxed text-ink",
      toneClass[tone],
      className,
    )}
  >
    <div className="min-w-0 flex-1">{children}</div>
    {onDismiss && (
      <button
        type="button"
        onClick={onDismiss}
        aria-label="关闭提示"
        className="-mr-1.5 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-control text-ink-secondary transition-colors hover:text-ink"
      >
        <CloseIcon className="size-4" />
      </button>
    )}
  </div>
)
