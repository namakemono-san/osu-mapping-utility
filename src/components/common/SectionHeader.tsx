import { ReactNode } from "react";

interface SectionHeaderProps {
    icon: ReactNode;
    title: string;
    action?: ReactNode;
}

export function SectionHeader({ icon, title, action }: SectionHeaderProps) {
    return (
        <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
                {icon}
                <h3 className="font-semibold text-sm">{title}</h3>
            </div>
            {action}
        </div>
    );
}