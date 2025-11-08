import { ReactNode } from "react";
import { cn } from "../../utils/cn";

interface CardProps {
    children: ReactNode;
    className?: string;
}

export function Card({ children, className }: CardProps) {
    return (
        <div className={cn("rounded-lg bg-[#1c1c1c] border border-[#2a2a2a]", className)}>
            {children}
        </div>
    );
}