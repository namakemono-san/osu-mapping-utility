import { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { FiCheck } from "react-icons/fi";

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label?: ReactNode;
    icon?: ReactNode;
    disabled?: boolean;
    className?: string;
}

export function Switch({
    checked,
    onChange,
    label,
    icon,
    disabled,
    className,
}: SwitchProps) {
    const toggle = () => {
        if (!disabled) onChange(!checked);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            toggle();
        }
    };

    return (
        <div
            role="switch"
            aria-checked={checked}
            tabIndex={disabled ? -1 : 0}
            onClick={toggle}
            onKeyDown={onKeyDown}
            className={cn(
                "inline-flex items-center gap-2 px-3 h-9 rounded-lg",
                "bg-[#1f1f1f] border border-[#2a2a2a] text-sm",
                "cursor-pointer select-none transition-all",
                checked && "ring-2 ring-[#16a34a]",
                disabled && "opacity-50 cursor-not-allowed",
                className
            )}
        >
            {icon && <span className="text-[#7b7b7b]">{icon}</span>}
            {label && <span>{label}</span>}
            <span
                className={cn(
                    "ml-1 inline-flex items-center justify-center w-5 h-5 rounded-sm border border-[#3a3a3a] transition-colors",
                    checked ? "bg-[#16a34a] text-white" : "bg-transparent"
                )}
            >
                {checked && <FiCheck />}
            </span>
        </div>
    );
}