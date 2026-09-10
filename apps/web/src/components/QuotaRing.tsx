import { cx } from "../lib/cx.ts"

type RingVariant = "chip" | "card"

type Geometry = { viewBox: number; radius: number; strokeWidth: number }

const geometry: Record<RingVariant, Geometry> = {
  chip: { viewBox: 20, radius: 7.5, strokeWidth: 3 },
  card: { viewBox: 120, radius: 50, strokeWidth: 12 },
}

const clampFraction = (remaining: number, limit: number): number => {
  if (limit <= 0) return 0
  return Math.min(1, Math.max(0, remaining / limit))
}

export const QuotaRing = ({
  remaining,
  limit,
  variant = "chip",
  label,
  className,
  caption,
}: {
  remaining: number
  limit: number
  variant?: RingVariant
  label: string
  className?: string
  caption?: string
}) => {
  const { viewBox, radius, strokeWidth } = geometry[variant]
  const center = viewBox / 2
  const circumference = 2 * Math.PI * radius
  const arc = circumference * clampFraction(remaining, limit)
  return (
    <svg
      viewBox={`0 0 ${viewBox} ${viewBox}`}
      role="img"
      aria-label={label}
      className={cx("shrink-0", variant === "chip" ? "size-4 md:size-4.5" : "size-30", className)}
    >
      <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-hairline" />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeDasharray={`${arc} ${circumference}`}
        transform={`rotate(-90 ${center} ${center})`}
        className="stroke-vermilion"
      />
      {variant === "card" && (
        <>
          <text x={center} y={56} textAnchor="middle" className="fill-ink font-mono text-heading-lg font-semibold">
            {remaining}
          </text>
          <text x={center} y={76} textAnchor="middle" className="fill-ink-secondary font-mono text-label-sm">
            {caption ?? `剩余 / ${limit}`}
          </text>
        </>
      )}
    </svg>
  )
}
