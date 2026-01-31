// File: src/components/dashboard/StatsRow.tsx
import { Users, Zap, Bot, AlertTriangle, TrendingUp } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from "../ui/card";
import { cn } from "@/shared/lib";

interface DashboardStats {
    total: number;
    avgGemini: number;
    avgClaude: number;
    lowQuota: number;
}

interface StatsRowProps {
    stats: DashboardStats;
}

import { memo } from 'react';

export const StatsRow = memo(({ stats }: StatsRowProps) => {
    const { t } = useTranslation();

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            
            {/* 1. Total Accounts */}
            <StatCard 
                title={t('dashboard.total_accounts')} 
                value={stats.total.toString()} 
                icon={Users} 
                // Placeholder for now as we don't track historical delta yet
                // trend={t('dashboard.new_accounts_trend', { count: 0 })}
                // trendUp={true}
                color="text-indigo-500"
                bg="bg-indigo-500/10"
            />

            {/* 2. Gemini Quota */}
            <StatCard 
                title={t('dashboard.avg_gemini')} 
                value={`${stats.avgGemini}%`} 
                icon={Zap} 
                subtext={t('dashboard.avg_gemini_desc')}
                color="text-blue-500"
                bg="bg-blue-500/10"
            />

            {/* 3. Claude Quota */}
            <StatCard 
                title={t('dashboard.avg_claude')} 
                value={`${stats.avgClaude}%`} 
                icon={Bot} 
                subtext={t('dashboard.avg_claude_desc')}
                color="text-orange-500"
                bg="bg-orange-500/10"
            />

            {/* 4. ALERTS (Low Quota) - Special Design */}
            <Card className="bg-red-950/20 border-red-900/50 backdrop-blur-sm relative overflow-hidden group">
                 <div className="absolute -right-6 -top-6 h-24 w-24 bg-red-500/20 rounded-full blur-2xl group-hover:bg-red-500/30 transition-all" />
                 
                 <CardContent className="p-6">
                    <div className="flex items-center justify-between space-y-0 pb-2">
                      <span className="text-sm font-medium text-red-400">{t('dashboard.quota_low')}</span>
                      <AlertTriangle className="h-4 w-4 text-red-500 animate-pulse" />
                    </div>
                    <div className="flex items-baseline gap-2 mt-2">
                        <div className="text-3xl font-bold text-red-500">{stats.lowQuota}</div>
                        <span className="text-xs text-red-400/70">{t('dashboard.attention_needed')}</span>
                    </div>
                 </CardContent>
            </Card>

        </div>
    );
});

// Reusable Stat Card Component
interface StatProps {
    title: string;
    value: string;
    icon: any;
    trend?: string;
    trendUp?: boolean;
    subtext?: string;
    color: string;
    bg: string;
    children?: React.ReactNode;
}

const StatCard = ({ title, value, icon: Icon, trend, trendUp, subtext, color, bg }: StatProps) => (
  <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm relative overflow-hidden hover:border-zinc-700 transition-all duration-300 group">
    <CardContent className="p-6">
      <div className="flex items-center justify-between space-y-0 pb-2">
        <span className="text-sm font-medium text-zinc-400">{title}</span>
        {/* Icon with glow background */}
        <div className={cn("p-2 rounded-lg transition-colors", bg)}>
           <Icon className={cn("h-4 w-4", color)} />
        </div>
      </div>
      
      <div className="mt-3">
        <div className="text-3xl font-bold text-white tracking-tight">{value}</div>
        
        {(trend || subtext) && (
            <div className="text-xs mt-1 flex items-center gap-1">
                {trend && (
                    <span className={cn("font-medium flex items-center gap-0.5", trendUp ? "text-emerald-400" : "text-red-400")}>
                        {trendUp ? <TrendingUp className="h-3 w-3" /> : null}
                        {trend}
                    </span>
                )}
                <span className="text-zinc-500 ml-1">{subtext}</span>
            </div>
        )}
      </div>

      {/* Decorative huge icon in background */}
      <Icon className={cn("absolute -bottom-4 -right-4 h-24 w-24 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity", color)} />
    </CardContent>
  </Card>
);
