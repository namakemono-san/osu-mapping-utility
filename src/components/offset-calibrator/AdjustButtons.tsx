const STEPS = [-10, -5, -2, -1, 1, 2, 5, 10] as const;

type Props = {
    value: number;
    onChange: (newValue: number) => void;
    min: number;
    max: number;
};

export function AdjustButtons({ value, onChange, min, max }: Props) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
                {STEPS.map((step) => {
                    const next = Math.min(max, Math.max(min, value + step));
                    const disabled = next === value;
                    const isMinus = step < 0;
                    return (
                        <button
                            key={step}
                            type="button"
                            disabled={disabled}
                            onClick={() => onChange(next)}
                            className={`h-8 px-2 rounded-md border text-xs font-mono transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isMinus
                                ? "border-red-500/30 bg-red-500/20 hover:bg-red-500/30"
                                : "border-green-500/30 bg-green-500/20 hover:bg-green-500/30"
                                }`}
                        >
                            {step > 0 ? `+${step}` : step}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
