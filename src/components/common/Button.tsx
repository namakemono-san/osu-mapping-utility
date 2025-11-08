import { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: ReactNode;
    children: ReactNode;
}

const variantStyles = {
    primary: "bg-[#2563eb] hover:bg-[#1f56cc] text-white shadow-lg",
    secondary: "bg-[#2a2a2a] hover:bg-[#343434] text-white",
    danger: "bg-[#ef4444] hover:bg-[#d63a3a] text-white",
    ghost: "hover:bg-[#2a2a2a] text-[#e0e0e0]",
};

const sizeStyles = {
    sm: "h-8 px-2 text-xs",
    md: "h-9 px-3 text-sm",
    lg: "h-11 px-4 text-base",
};

export function Button({
    variant = "secondary",
    size = "md",
    icon,
    children,
    className,
    disabled,
    ...props
}: ButtonProps) {
    return (
        <button
            className={cn(
                "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "active:scale-95",
                variantStyles[variant],
                sizeStyles[size],
                className
            )}
            disabled={disabled}
            {...props}
        >
            {icon && <span className="flex-shrink-0">{icon}</span>}
            <span>{children}</span>
        </button>
    );
}