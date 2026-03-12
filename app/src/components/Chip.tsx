import { ReactNode } from "react";
import { cn } from "../utils/cn";

interface ChipProps {
    icon?: ReactNode;
    children: ReactNode;
    className?: string;
    title?: string;
}

export function Chip({ icon, children, className, title }: ChipProps) {
    return (
        <div
            className={cn(
                "inline-flex items-center gap-2 px-3 h-9 rounded-lg",
                "bg-surface-base border border-border-muted text-sm",
                className
            )}
            title={title}
        >
            {icon && <span className="text-text-muted shrink-0">{icon}</span>}
            <span className="truncate">{children}</span>
        </div>
    );
}
