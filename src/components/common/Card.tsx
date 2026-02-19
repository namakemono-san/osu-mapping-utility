import { ReactNode } from "react";
import { cn } from "../../utils/cn";

interface CardProps {
    children: ReactNode;
    className?: string;
}

export function Card({ children, className }: CardProps) {
    return (
        <div className={cn("rounded-lg bg-surface-base-soft border border-border-muted", className)}>
            {children}
        </div>
    );
}