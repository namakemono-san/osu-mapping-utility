import { ReactNode } from "react";
import { FiX } from "react-icons/fi";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    hideCloseButton?: boolean;
}

export function Modal({ isOpen, onClose, title, children, hideCloseButton }: ModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-surface-control border border-border-muted rounded-xl shadow-2xl w-full max-w-md mx-4">
                <div className="flex items-center justify-between p-4 border-b border-border-muted">
                    <h3 className="text-lg font-bold text-white">{title}</h3>
                    {!hideCloseButton && (
                        <button
                            onClick={onClose}
                            className="text-text-muted hover:text-white transition-colors"
                        >
                            <FiX className="w-5 h-5" />
                        </button>
                    )}
                </div>
                <div className="p-4">{children}</div>
            </div>
        </div>
    );
}