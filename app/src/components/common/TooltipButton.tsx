import { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";

interface TooltipButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    tooltip: ReactNode;
    children: ReactNode;
}

export function TooltipButton({
    tooltip,
    children,
    className,
    ...props
}: TooltipButtonProps) {
    return (
        <div className="relative group">
            <button
                className={cn(
                    "flex items-center h-8 px-2 py-1.5 rounded-lg text-sm font-medium transition-all",
                    className
                )}
                {...props}
            >
                {children}
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                {tooltip}
            </div>
        </div>
    );
}
