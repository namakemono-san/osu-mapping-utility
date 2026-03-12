interface LoadingSpinnerProps {
    label?: string;
}

export function LoadingSpinner({ label }: LoadingSpinnerProps) {
    return (
        <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            {label && <span className="text-text-secondary text-sm">{label}</span>}
        </div>
    );
}
