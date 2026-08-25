const STEPS = [-10, -5, -2, -1, 1, 2, 5, 10] as const

type AdjustButtonsProps = {
  value: number
  onChange: (value: number) => void
  min: number
  max: number
}

export function AdjustButtons({
  value,
  onChange,
  min,
  max
}: AdjustButtonsProps): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1">
      {STEPS.map((step) => {
        const next = Math.min(max, Math.max(min, value + step))
        return (
          <button
            key={step}
            type="button"
            disabled={next === value}
            onClick={() => onChange(next)}
            className={`h-8 rounded-md border px-2 font-mono text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              step < 0
                ? 'border-red-500/30 bg-red-500/20 hover:bg-red-500/30'
                : 'border-green-500/30 bg-green-500/20 hover:bg-green-500/30'
            }`}
          >
            {step > 0 ? `+${step}` : step}
          </button>
        )
      })}
    </div>
  )
}
