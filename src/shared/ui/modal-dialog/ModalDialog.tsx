// File: src/shared/ui/modal-dialog/ModalDialog.tsx
// Modal dialog component

import { AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

export type ModalType = 'confirm' | 'success' | 'error' | 'info';

interface ModalDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    type?: ModalType;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
}

export function ModalDialog({
    isOpen,
    title,
    message,
    type = 'confirm',
    onConfirm,
    onCancel,
    confirmText,
    cancelText,
    isDestructive = false
}: ModalDialogProps) {
    const { t } = useTranslation();
    const finalConfirmText = confirmText || t('common.confirm');
    const finalCancelText = cancelText || t('common.cancel');

    if (!isOpen) return null;

    const getIcon = () => {
        switch (type) {
            case 'success':
                return <CheckCircle className="w-7 h-7 text-green-500" />;
            case 'error':
                return <XCircle className="w-7 h-7 text-red-500" />;
            case 'info':
                return <Info className="w-7 h-7 text-blue-500" />;
            case 'confirm':
            default:
                return isDestructive ? <AlertTriangle className="w-7 h-7 text-red-500" /> : <AlertTriangle className="w-7 h-7 text-blue-500" />;
        }
    };

    const getIconBg = () => {
        switch (type) {
            case 'success': return 'bg-green-50 dark:bg-green-900/20';
            case 'error': return 'bg-red-50 dark:bg-red-900/20';
            case 'info': return 'bg-blue-50 dark:bg-blue-900/20';
            case 'confirm': default: return isDestructive ? 'bg-red-50 dark:bg-red-900/20' : 'bg-blue-50 dark:bg-blue-900/20';
        }
    };

    const showCancel = type === 'confirm' && onCancel;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div data-tauri-drag-region className="fixed top-0 left-0 right-0 h-8 z-[110]" />
            
            <div className="relative max-w-sm w-full mx-4 bg-white dark:bg-zinc-900 shadow-2xl rounded-2xl p-0 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center text-center p-6 pt-8">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 shadow-sm ${getIconBg()}`}>
                        {getIcon()}
                    </div>

                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">{title}</h3>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8 leading-relaxed px-4">{message}</p>

                    <div className="flex gap-3 w-full">
                        {showCancel && (
                            <button
                                className="flex-1 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700"
                                onClick={onCancel}
                            >
                                {finalCancelText}
                            </button>
                        )}
                        <button
                            className={`flex-1 px-4 py-2.5 text-white font-medium rounded-xl shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${isDestructive && type === 'confirm'
                                ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500'
                                : 'bg-indigo-500 hover:bg-indigo-600 focus:ring-indigo-500'
                                }`}
                            onClick={onConfirm}
                        >
                            {finalConfirmText}
                        </button>
                    </div>
                </div>
            </div>
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[-1]" onClick={showCancel ? onCancel : undefined} />
        </div>,
        document.body
    );
}

export default ModalDialog;
