import { SelectHTMLAttributes, ReactNode, forwardRef } from "react";
import { cn } from "../utils/cn";
import { FiChevronDown } from "react-icons/fi";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
    icon?: ReactNode;
    children: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
    ({ icon, children, className, ...props }, ref) => {
        return (
            <div className="relative flex items-center gap-2">
                {icon && <div className="text-text-muted">{icon}</div>}
                <div className="relative flex-1">
                    <select
                        ref={ref}
                        className={cn(
                            "appearance-none w-full h-9 px-3 pr-8 rounded-lg",
                            "bg-surface-base border border-border-muted text-white text-sm",
                            "focus:outline-none focus:border-border-focus transition-colors",
                            "disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
                            className
                        )}
                        {...props}
                    >
                        {children}
                    </select>
                    <FiChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-muted" />
                </div>
            </div>
        );
    }
);

Select.displayName = "Select";
