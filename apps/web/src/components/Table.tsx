import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react"
import { cx } from "../lib/cx.ts"

export const Table = ({ children, className, label }: { children: ReactNode; className?: string; label?: string }) => (
  <div className="relative w-full overflow-x-auto">
    <table aria-label={label} className={cx("w-full border-collapse border-t-thin border-ink text-ui", className)}>
      {children}
    </table>
  </div>
)

type ThProps = ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }

export const Th = ({ children, className, ...rest }: ThProps) => (
  <th
    scope="col"
    className={cx(
      "whitespace-nowrap border-b-thin border-hairline px-3.5 py-3 text-left font-mono text-label-sm font-regular text-ink-secondary",
      className,
    )}
    {...rest}
  >
    {children}
  </th>
)

type TdProps = TdHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }

export const Td = ({ children, className, ...rest }: TdProps) => (
  <td className={cx("border-b-thin border-hairline px-3.5 py-3 align-top leading-normal", className)} {...rest}>
    {children}
  </td>
)
