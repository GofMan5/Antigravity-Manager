import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfigStore } from '../../../stores/useConfigStore';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/button';
import { Check } from 'lucide-react';

interface Language {
    code: string;
    label: string;
    short: string;
}

const languages: Language[] = [
    { code: 'zh', label: '简体中文', short: 'ZH' },
    { code: 'zh-TW', label: '繁體中文', short: 'TW' },
    { code: 'en', label: 'English', short: 'EN' },
    { code: 'ja', label: '日本語', short: 'JA' },
    { code: 'tr', label: 'Türkçe', short: 'TR' },
    { code: 'vi', label: 'Tiếng Việt', short: 'VI' },
    { code: 'pt', label: 'Português', short: 'PT' },
    { code: 'ko', label: '한국어', short: 'KO' },
    { code: 'ru', label: 'Русский', short: 'RU' },
    { code: 'ar', label: 'العربية', short: 'AR' },
];

export function LanguageSelector() {
    const { config, saveConfig } = useConfigStore();
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleLanguageChange = async (langCode: string) => {
        if (!config) return;
        await saveConfig({ ...config, language: langCode }, true);
        setIsOpen(false);
    };

    const currentLang = languages.find(l => l.code === config?.language) || languages.find(l => l.code === 'en')!;

    return (
        <div className="relative z-50" ref={containerRef}>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(!isOpen)}
                className="w-9 h-9 p-0 font-bold"
                aria-label="Select Language"
            >
                {currentLang.short}
            </Button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -10 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="absolute right-0 mt-2 w-48 bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-lg shadow-2xl ring-1 ring-black/50 overflow-hidden z-[100]"
                    >
                        <div className="max-h-[300px] overflow-y-auto">
                            {languages.map((lang) => (
                                <button
                                    key={lang.code}
                                    onClick={() => handleLanguageChange(lang.code)}
                                    className={cn(
                                        "w-full flex items-center justify-between px-3 py-2 text-sm rounded-sm hover:bg-zinc-800 hover:text-white transition-colors text-left",
                                        config?.language === lang.code && "bg-indigo-600 text-white font-medium hover:bg-indigo-700"
                                    )}
                                >
                                    <span className="flex items-center gap-2">
                                        <span className="text-xs font-mono opacity-50 w-6">{lang.short}</span>
                                        {lang.label}
                                    </span>
                                    {config?.language === lang.code && (
                                        <Check className="w-4 h-4 text-white" />
                                    )}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
