import { InputHTMLAttributes, ReactNode, forwardRef } from "react";
import { cn } from "../utils/cn";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    icon?: ReactNode;
    error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ icon, error, className, ...props }, ref) => {
        return (
            <div className="w-full">
                <div className="relative">
                    {icon && (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
                            {icon}
                        </div>
                    )}
                    <input
                        ref={ref}
                        className={cn(
                            "h-9 w-full px-3 rounded-lg bg-surface-input border border-border-muted",
                            "text-sm text-white placeholder-text-muted",
                            "focus:outline-none focus:border-border-focus transition-colors",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            icon && "pl-9",
                            error && "border-red-500",
                            className
                        )}
                        {...props}
                    />
                </div>
                {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
            </div>
        );
    }
);

Input.displayName = "Input";
