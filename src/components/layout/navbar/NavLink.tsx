import { Link } from 'react-router-dom';
import { cn } from '@/shared/lib';
import { motion } from 'framer-motion';

interface NavLinkProps {
    to: string;
    children: React.ReactNode;
    isActive: boolean;
}

export function NavLink({ to, children, isActive }: NavLinkProps) {
    return (
        <Link
            to={to}
            className={cn(
                "relative px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300",
                isActive 
                    ? "text-white dark:text-black" 
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            )}
        >
            {isActive && (
                <motion.div
                    layoutId="navbar-active"
                    className="absolute inset-0 bg-black dark:bg-white rounded-full -z-10 shadow-sm"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
            )}
            <span className="relative z-10">{children}</span>
        </Link>
    );
}
