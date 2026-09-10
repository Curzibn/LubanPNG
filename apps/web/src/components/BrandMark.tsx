import { Link } from "react-router"
import { cx } from "../lib/cx.ts"

type MarkSize = "header" | "footer"

const markClass: Record<MarkSize, string> = {
  header: "size-6.5 rounded-mark text-ui-lg md:size-7.5 md:text-brand-mark",
  footer: "size-5.5 rounded-mark-sm text-ui",
}

export const BrandMark = ({ size = "header", className }: { size?: MarkSize; className?: string }) => (
  <span
    aria-hidden="true"
    className={cx(
      "inline-flex shrink-0 items-center justify-center bg-vermilion font-display leading-none text-paper",
      markClass[size],
      className,
    )}
  >
    鲁
  </span>
)

export const Wordmark = ({ className }: { className?: string }) => (
  <span className={cx("font-mono font-semibold tracking-tight text-ink", className)}>LubanPNG</span>
)

export const BrandLink = () => (
  <Link to="/" className="flex items-center gap-2.5 md:gap-3" aria-label="LubanPNG 首页">
    <BrandMark />
    <Wordmark className="text-body-lg leading-none md:text-heading-sm" />
  </Link>
)
