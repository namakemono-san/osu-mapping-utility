interface ProgressBarProps {
    percentage: number;
}

export function ProgressBar({ percentage }: ProgressBarProps) {
    return (
        <div className="relative w-full h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
            <div
                className="absolute inset-y-0 left-0 bg-[#2563eb] transition-all duration-300 rounded-full"
                style={{ width: `${percentage}%` }}
            />
        </div>
    );
}