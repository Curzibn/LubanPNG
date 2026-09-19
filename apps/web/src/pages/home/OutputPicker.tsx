import { useI18n } from "../../i18n/I18nProvider.tsx"
import { cx } from "../../lib/cx.ts"
import { CONVERSION_EXTRA_UNITS, OUTPUT_CHOICES, outputFormatLabel, type OutputChoice } from "./compressorRules.ts"

const choices: ReadonlyArray<OutputChoice> = ["keep", ...OUTPUT_CHOICES]

export const OutputPicker = ({ value, onChange }: { value: OutputChoice; onChange: (choice: OutputChoice) => void }) => {
  const { t } = useI18n()
  const hintFor = (choice: OutputChoice): string => {
    if (choice === "keep") return t("output.hint.keep")
    const base = t("output.hint.convert", { units: CONVERSION_EXTRA_UNITS })
    return choice === "jpeg" ? `${base} ${t("output.hint.jpeg")}` : base
  }
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-4">
      <div role="radiogroup" aria-label={t("output.aria")} className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-label text-ink-secondary md:text-ui">{t("output.label")}</span>
        {choices.map((choice) => {
          const selected = choice === value
          return (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(choice)}
              className={cx(
                "inline-flex h-control-xs items-center rounded-pill border-thin px-3.5 font-mono text-label font-semibold transition-colors",
                selected ? "border-ink bg-ink text-paper" : "border-hairline bg-surface text-ink hover:border-ink",
              )}
            >
              {choice === "keep" ? t("output.keep") : outputFormatLabel(choice)}
            </button>
          )
        })}
      </div>
      <p className="text-label text-ink-secondary">{hintFor(value)}</p>
    </div>
  )
}
