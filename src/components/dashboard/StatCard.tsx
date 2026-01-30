import { Card, CardContent } from "../ui/card";
import { cn } from "../../lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
    title: string;
    value: string | number;
    icon: LucideIcon;
    iconColor?: string;
    subValue?: {
        label: string;
        text: string;
        color?: string;
    };
    alert?: boolean;
    className?: string; // Allow custom classes for flexibility
}

import { memo } from "react";

// ... imports

export const StatCard = memo(function StatCard({ title, value, icon: Icon, iconColor = "text-blue-500", subValue, alert, className }: StatCardProps) {
    // Extract color base from iconColor class (e.g. "text-blue-500" -> "blue")
    const colorBase = iconColor.replace('text-', '').replace('-500', '');
    
    return (
        <Card className={cn(
            "relative overflow-hidden transition-all duration-300 group hover:shadow-xl hover:-translate-y-1", 
            "bg-zinc-900 border-white/5",
            // Dynamic border color on hover based on the icon color
            !alert && `hover:border-${colorBase}-500/30`,
            // Red alert card specific styling - RED GLOW
            alert ? "border-red-500/20 bg-red-950/10 hover:border-red-500/40 hover:bg-red-950/20" : "",
            className
        )}>
            {/* Dynamic Gradient Glow */}
            {!alert && (
                <div className={cn(
                    "absolute inset-0 bg-gradient-to-br opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none",
                    `from-${colorBase}-500/10 via-transparent to-transparent`
                )} />
            )}
             
            {/* Alert specific glow */}
            {alert && (
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-transparent to-transparent opacity-50 pointer-events-none" />
            )}

            <div className={cn("absolute right-0 top-0 p-4 opacity-10 transition-opacity duration-300 group-hover:opacity-30", alert ? "opacity-30 text-red-500" : "")}>
                 <Icon className={cn("w-16 h-16 -mr-4 -mt-4", iconColor, alert ? "text-red-500" : "")} />
            </div>

            <CardContent className="p-6 relative z-10 flex flex-col justify-between h-full space-y-2">
                <div>
                     <div className={cn("text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-2", alert ? "text-red-400" : "text-zinc-500")}>
                        <div className={cn("w-1.5 h-1.5 rounded-full", alert ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" : iconColor.replace('text-', 'bg-'))} />
                        {title}
                    </div>
                    <div className={cn("text-4xl font-black tracking-tighter leading-none", alert ? "text-red-500" : "text-white")}>
                        {value}
                    </div>
                </div>
                
                {subValue && (
                     <div className="flex items-center gap-2 pt-2 border-t border-border/40 mt-1">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                            {subValue.label}
                        </span>
                        {subValue.text && (
                             <span className={cn("text-[10px] font-bold ml-auto px-1.5 py-0.5 rounded-sm bg-secondary/50", subValue.color?.replace('bg-', 'text-'))}>
                                {subValue.text}
                             </span>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
});

// Keeping the original "Sparkles" avg style support if needed, but standardizing is better.
// I will adopt the generic StatCard for all to keep it clean, but "Avg" cards had bars.
// Let's make a variation or just use children? 
// Actually, the previous Dashboard had "Gemini Pro" with a bar/dot.
// I'll stick to the "StatCard" being flexible enough.
