// File: src/shared/ui/toast/Toast.tsx
// Toast notification component

import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastProps {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
    onClose: (id: string) => void;
}

export const Toast = ({ id, message, type, duration = 3000, onClose }: ToastProps) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        requestAnimationFrame(() => setIsVisible(true));

        if (duration > 0) {
            const timer = setTimeout(() => {
                setIsVisible(false);
                setTimeout(() => onClose(id), 300);
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [duration, id, onClose]);

    const getIcon = () => {
        switch (type) {
            case 'success': return <CheckCircle className="w-5 h-5 text-green-500" />;
            case 'error': return <XCircle className="w-5 h-5 text-red-500" />;
            case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
            case 'info': default: return <Info className="w-5 h-5 text-blue-500" />;
        }
    };

    const getStyles = () => {
        switch (type) {
            case 'success': return 'border-green-200 dark:border-green-900/30 bg-white dark:bg-zinc-900';
            case 'error': return 'border-red-200 dark:border-red-900/30 bg-white dark:bg-zinc-900';
            case 'warning': return 'border-yellow-200 dark:border-yellow-900/30 bg-white dark:bg-zinc-900';
            case 'info': default: return 'border-blue-200 dark:border-blue-900/30 bg-white dark:bg-zinc-900';
        }
    };

    return (
        <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border transition-all duration-300 transform ${getStyles()} ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
            style={{ minWidth: '300px' }}
        >
            {getIcon()}
            <p className="flex-1 text-sm font-medium text-zinc-700 dark:text-zinc-200">{message}</p>
            <button
                onClick={() => { setIsVisible(false); setTimeout(() => onClose(id), 300); }}
                className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};

export default Toast;
