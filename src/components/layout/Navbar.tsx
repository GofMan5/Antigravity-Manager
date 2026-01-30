import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  Users, 
  Globe, 
  Activity, 
  Settings, 
  Sun, 
  Moon,
  Zap
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConfigStore } from '../../stores/useConfigStore';
import { isLinux } from '../../utils/env';
import { memo, useCallback } from 'react';
import { LanguageSelector } from './navbar/LanguageSelector';
import { cn } from '../../lib/utils';

const Navbar = function Navbar() {
    const location = useLocation();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { config, saveConfig } = useConfigStore();

    const navItems = [
        { path: '/', label: t('nav.dashboard'), icon: LayoutDashboard },
        { path: '/accounts', label: t('nav.accounts'), icon: Users },
        { path: '/api-proxy', label: t('nav.proxy'), icon: Globe },
        { path: '/monitor', label: t('nav.call_records'), icon: Activity },
        { path: '/token-stats', label: t('nav.token_stats', 'Token Stats'), icon: Zap },
        { path: '/settings', label: t('nav.settings'), icon: Settings },
    ];

    const toggleTheme = useCallback(async (event: React.MouseEvent<HTMLButtonElement>) => {
        if (!config) return;

        const newTheme = config.theme === 'light' ? 'dark' : 'light';

        // View Transition API for smooth theme switch
        if ('startViewTransition' in document && !isLinux()) {
            const x = event.clientX;
            const y = event.clientY;
            const endRadius = Math.hypot(
                Math.max(x, window.innerWidth - x),
                Math.max(y, window.innerHeight - y)
            );

            // @ts-ignore
            const transition = document.startViewTransition(async () => {
                await saveConfig({ ...config, theme: newTheme }, true);
            });

            transition.ready.then(() => {
                const isDarkMode = newTheme === 'dark';
                const clipPath = isDarkMode
                    ? [`circle(${endRadius}px at ${x}px ${y}px)`, `circle(0px at ${x}px ${y}px)`]
                    : [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`];

                document.documentElement.animate(
                    { clipPath },
                    {
                        duration: 500,
                        easing: 'ease-in-out',
                        fill: 'forwards',
                        pseudoElement: isDarkMode ? '::view-transition-old(root)' : '::view-transition-new(root)'
                    }
                );
            });
        } else {
            await saveConfig({ ...config, theme: newTheme }, true);
        }
    }, [config, saveConfig]);

    const isActive = useCallback((path: string) => {
        if (path === '/') return location.pathname === '/';
        return location.pathname.startsWith(path);
    }, [location.pathname]);

    return (
        <header 
            className="fixed top-0 left-0 right-0 z-[999] border-b border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-black/60 backdrop-blur-xl supports-[backdrop-filter]:bg-white/30 dark:supports-[backdrop-filter]:bg-black/30"
            data-tauri-drag-region
        >
            <div className="container mx-auto px-4 h-16 flex items-center justify-between" data-tauri-drag-region>
                
                {/* 1. LOGO SECTION */}
                <Link to="/" className="flex items-center gap-2" data-tauri-drag-region>
                    <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-[0_0_15px_rgba(79,70,229,0.5)]">
                        <span className="font-bold text-white text-lg">A</span>
                    </div>
                    <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-500 dark:from-white dark:to-zinc-400">
                        Antigravity
                    </span>
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                        v2.4
                    </span>
                </Link>

                {/* 2. NAVIGATION (CENTER) */}
                <nav className="hidden md:flex items-center gap-1" data-tauri-drag-region>
                    {navItems.map((item) => {
                        const active = isActive(item.path);
                        return (
                            <button
                                key={item.path}
                                onClick={() => navigate(item.path)}
                                className={cn(
                                    "relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-200 z-10",
                                    active
                                        ? "text-zinc-900 dark:text-white"
                                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                                )}
                            >
                                {active && (
                                    <motion.span
                                        layoutId="navbar-active"
                                        className="absolute inset-0 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700/50 shadow-sm -z-10"
                                        transition={{
                                            type: "spring",
                                            stiffness: 500,
                                            damping: 30,
                                        }}
                                    />
                                )}
                                <item.icon className={cn("h-4 w-4 relative z-20", active ? "text-indigo-500 dark:text-indigo-400" : "opacity-70")} />
                                <span className={cn("relative z-20", active ? "opacity-100" : "opacity-90")}>{item.label}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* 3. ACTIONS (RIGHT) */}
                <div className="flex items-center gap-3" data-tauri-drag-region>
                    {/* Status Indicator */}
                    <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-500">System Stable</span>
                    </div>

                    <div className="h-6 w-px bg-zinc-200 dark:bg-zinc-800 mx-1" /> {/* Divider */}

                    <LanguageSelector />

                    <button 
                        onClick={toggleTheme}
                        className="p-2 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        title={config?.theme === 'light' ? t('nav.theme_to_dark') : t('nav.theme_to_light')}
                    >
                        {config?.theme === 'light' ? (
                            <Moon className="h-4 w-4" />
                        ) : (
                            <Sun className="h-4 w-4" />
                        )}
                    </button>
                </div>
            </div>
        </header>
    );
};

export default memo(Navbar);
