// File: src/pages/TokenStats.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { request as invoke } from '../utils/request';
import { useTranslation } from 'react-i18next';
import { Clock, Calendar, CalendarDays, RefreshCw } from 'lucide-react';
import { StatsSummary } from '../components/stats/StatsSummary';
import { StatsCharts, PieDataPoint } from '../components/stats/StatsCharts';
import { RequestHealthCards, ProxyStats } from '../components/stats/RequestHealthCards';
import { cn } from '../lib/utils';
import { Button } from '../components/ui/button';

// --- Types (Shared) ---
interface TokenStatsAggregated {
    period: string;
    total_input_tokens: number;
    total_output_tokens: number;
    total_tokens: number;
    request_count: number;
}

interface AccountTokenStats {
    account_email: string;
    total_input_tokens: number;
    total_output_tokens: number;
    total_tokens: number;
    request_count: number;
}

interface ModelTokenStats {
    model: string;
    total_input_tokens: number;
    total_output_tokens: number;
    total_tokens: number;
    request_count: number;
}

interface ModelTrendPoint {
    period: string;
    model_data: Record<string, number>;
}

interface AccountTrendPoint {
    period: string;
    account_data: Record<string, number>;
}

interface TokenStatsSummary {
    total_input_tokens: number;
    total_output_tokens: number;
    total_tokens: number;
    total_requests: number;
    unique_accounts: number;
}

type TimeRange = 'hourly' | 'daily' | 'weekly';
type ViewMode = 'model' | 'account';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#f43f5e'];

const TokenStats: React.FC = () => {
    const { t } = useTranslation();
    const [timeRange, setTimeRange] = useState<TimeRange>('daily');
    const [viewMode, setViewMode] = useState<ViewMode>('model');
    
    // Data States
    const [chartData, setChartData] = useState<TokenStatsAggregated[]>([]);
    const [accountData, setAccountData] = useState<AccountTokenStats[]>([]);
    const [modelData, setModelData] = useState<ModelTokenStats[]>([]);
    const [modelTrendData, setModelTrendData] = useState<any[]>([]);
    const [accountTrendData, setAccountTrendData] = useState<any[]>([]);
    const [allModels, setAllModels] = useState<string[]>([]);
    const [allAccounts, setAllAccounts] = useState<string[]>([]);
    const [summary, setSummary] = useState<TokenStatsSummary | null>(null);
    const [requestStats, setRequestStats] = useState<ProxyStats | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            let hours = 24;
            let data: TokenStatsAggregated[] = [];
            let modelTrend: ModelTrendPoint[] = [];
            let accountTrend: AccountTrendPoint[] = [];

            // Fetch generic request stats
            const reqStats = await invoke<ProxyStats>('get_proxy_stats');
            setRequestStats(reqStats);

            switch (timeRange) {
                case 'hourly':
                    hours = 24;
                    // Fix: Ensure we call endpoints that actually exist or map correctly.
                    data = await invoke<TokenStatsAggregated[]>('get_token_stats_hourly', { hours: 24 });
                    modelTrend = await invoke<ModelTrendPoint[]>('get_token_stats_model_trend_hourly', { hours: 24 });
                    accountTrend = await invoke<AccountTrendPoint[]>('get_token_stats_account_trend_hourly', { hours: 24 });
                    break;
                case 'daily':
                    hours = 168; // 7 days
                    data = await invoke<TokenStatsAggregated[]>('get_token_stats_daily', { days: 7 });
                    modelTrend = await invoke<ModelTrendPoint[]>('get_token_stats_model_trend_daily', { days: 7 });
                    accountTrend = await invoke<AccountTrendPoint[]>('get_token_stats_account_trend_daily', { days: 7 });
                    break;
                case 'weekly':
                    hours = 720; // 30 days
                    data = await invoke<TokenStatsAggregated[]>('get_token_stats_weekly', { weeks: 4 });
                    modelTrend = await invoke<ModelTrendPoint[]>('get_token_stats_model_trend_daily', { days: 30 }); 
                    accountTrend = await invoke<AccountTrendPoint[]>('get_token_stats_account_trend_daily', { days: 30 });
                    break;
            }

            setChartData(data);

            // Process Model Trend
            const models = new Set<string>();
            modelTrend.forEach(point => Object.keys(point.model_data).forEach(m => models.add(m)));
            const modelList = Array.from(models);
            setAllModels(modelList);
            const transformedTrend = modelTrend.map(point => {
                const row: Record<string, any> = { period: point.period };
                modelList.forEach(model => row[model] = point.model_data[model] || 0);
                return row;
            });
            setModelTrendData(transformedTrend);

            // Process Account Trend
            const accountsSet = new Set<string>();
            accountTrend.forEach(point => Object.keys(point.account_data).forEach(acc => accountsSet.add(acc)));
            const accountList = Array.from(accountsSet);
            setAllAccounts(accountList);
            const transformedAccountTrend = accountTrend.map(point => {
                const row: Record<string, any> = { period: point.period };
                accountList.forEach(acc => row[acc] = point.account_data[acc] || 0);
                return row;
            });
            setAccountTrendData(transformedAccountTrend);

            // Summary Stats
            const [accounts, models_stats, summaryData] = await Promise.all([
                invoke<AccountTokenStats[]>('get_token_stats_by_account', { hours }),
                invoke<ModelTokenStats[]>('get_token_stats_by_model', { hours }),
                invoke<TokenStatsSummary>('get_token_stats_summary', { hours })
            ]);

            setAccountData(accounts);
            setModelData(models_stats);
            setSummary(summaryData);
        } catch (error) {
            console.error('Failed to fetch token stats:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [timeRange]);

    // Format Data for Charts
    const pieData: PieDataPoint[] = useMemo(() => accountData.slice(0, 8).map((account, index) => ({
        name: account.account_email.split('@')[0] + '...',
        value: account.total_tokens,
        fullEmail: account.account_email,
        color: COLORS[index % COLORS.length]
    })), [accountData]);

    const activeTrendData = viewMode === 'model' ? modelTrendData : accountTrendData;
    const activeKeys = viewMode === 'model' ? allModels : allAccounts;

    return (
        <div className="h-full w-full overflow-y-auto bg-gray-50/30 dark:bg-black/20">
            <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
                {/* Header Actions */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">
                            {t('token_stats.title', 'Statistics')}
                        </h1>
                        <p className="text-zinc-500 text-sm mt-1">
                            {t('token_stats.subtitle', 'Monitor your AI usage and costs in real-time')}
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-3 bg-white dark:bg-zinc-900 p-1.5 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
                        {(['hourly', 'daily', 'weekly'] as TimeRange[]).map((range) => (
                             <button
                                key={range}
                                onClick={() => setTimeRange(range)}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                                    timeRange === range
                                        ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm"
                                        : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                                )}
                            >
                                {range === 'hourly' && <Clock className="w-4 h-4" />}
                                {range === 'daily' && <Calendar className="w-4 h-4" />}
                                {range === 'weekly' && <CalendarDays className="w-4 h-4" />}
                                <span className="capitalize">{range}</span>
                            </button>
                        ))}
                        <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-1" />
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={fetchData}
                            className="h-9 w-9 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                            disabled={loading}
                        >
                            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
                        </Button>
                    </div>
                </div>

                {/* Request Health (New) */}
                <RequestHealthCards 
                    stats={requestStats} 
                    isLoading={loading} 
                    fallbackTotalRequests={summary?.total_requests}
                    fallbackTotalTokens={summary?.total_tokens}
                    fallbackInputTokens={summary?.total_input_tokens}
                    fallbackOutputTokens={summary?.total_output_tokens}
                />

                {/* Summary Cards */}
                <StatsSummary 
                    summary={summary} 
                    modelCount={modelData.length} 
                    isLoading={loading} 
                />

                {/* Charts */}
                <StatsCharts 
                    trendData={activeTrendData}
                    usageData={chartData}
                    pieData={pieData}
                    allKeys={activeKeys}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    timeRange={timeRange}
                    isLoading={loading}
                />
            </div>
        </div>
    );
};

export default TokenStats;
