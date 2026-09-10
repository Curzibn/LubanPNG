import { cx } from "../../lib/cx.ts"
import { CONVERSION_EXTRA_UNITS, OUTPUT_CHOICES, type OutputChoice } from "./compressorRules.ts"

const hintFor = (choice: OutputChoice): string => {
  if (choice === "keep") return "只压缩，格式不变。"
  const base = `转换额外计 ${CONVERSION_EXTRA_UNITS} 次，动图请保持原格式。`
  return choice === "jpeg" ? `${base} 透明区域填白。` : base
}

export const OutputPicker = ({ value, onChange }: { value: OutputChoice; onChange: (choice: OutputChoice) => void }) => (
  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
    <div role="radiogroup" aria-label="输出格式" className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-label text-ink-secondary md:text-ui">输出</span>
      {OUTPUT_CHOICES.map((choice) => {
        const selected = choice.value === value
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(choice.value)}
            className={cx(
              "inline-flex h-control-xs items-center rounded-pill border-thin px-3.5 font-mono text-label font-semibold transition-colors",
              selected ? "border-ink bg-ink text-paper" : "border-hairline bg-surface text-ink hover:border-ink",
            )}
          >
            {choice.label}
          </button>
        )
      })}
    </div>
    <p className="text-label text-ink-secondary">{hintFor(value)}</p>
  </div>
)
