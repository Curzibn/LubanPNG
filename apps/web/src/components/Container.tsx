import type { ReactNode } from "react"
import { cx } from "../lib/cx.ts"

export const Container = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cx("px-5 md:px-10", className)}>
    <div className="mx-auto w-full max-w-page">{children}</div>
  </div>
)
