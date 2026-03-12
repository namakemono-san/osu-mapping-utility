import { FiCheckCircle, FiAlertTriangle } from "react-icons/fi";
import { Card } from "./Card";

interface StatusMessageProps {
    type: "success" | "error";
    message: string;
}

export function StatusMessage({ type, message }: StatusMessageProps) {
    const isSuccess = type === "success";

    return (
        <Card
            className={`flex items-center gap-2.5 px-3 py-2.5 ${isSuccess
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400"
                }`}
        >
            {isSuccess ? (
                <FiCheckCircle className="w-4 h-4 flex-shrink-0" />
            ) : (
                <FiAlertTriangle className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="text-sm">{message}</span>
        </Card>
    );
}
