import { useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Users, ArrowRight, Download, RefreshCw, LayoutDashboard } from 'lucide-react';
import { motion } from 'framer-motion';

import { isTauri } from '../utils/env';
import { save } from '@tauri-apps/plugin-dialog';
import { request as invoke } from '../utils/request';
import { showToast } from '../components/common/ToastContainer';

// FSD / Hooks
import { useAccounts } from '../hooks/queries/useAccounts';
import { useCurrentAccount } from '../hooks/queries/useCurrentAccount';
import { Account } from '../types/account';
import { DashboardSkeleton } from '../components/dashboard/DashboardSkeleton';

// UI
import CurrentAccount from '../components/dashboard/CurrentAccount';
import BestAccounts from '../components/dashboard/BestAccounts';
import AddAccountDialog from '../components/accounts/AddAccountDialog';
import { StatsRow } from '../components/dashboard/StatsRow';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';

// Framer Motion Variants
const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1
        }
    }
};

const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
        y: 0,
        opacity: 1,
        transition: {
            type: "spring",
            stiffness: 100
        }
    }
};

function Dashboard() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    // Data Hooks (FSD: encapsulated data logic)
    const { accounts, isLoading: isLoadingAccounts, addAccount, switchAccount } = useAccounts();
    const { currentAccount, refreshQuota, isRefreshing } = useCurrentAccount();
    
    // Derived State (Stats)
    const stats = useMemo(() => {
        if (!accounts || accounts.length === 0) {
             return { total: 0, avgGemini: 0, avgGeminiImage: 0, avgClaude: 0, lowQuota: 0 };
        }

        const geminiQuotas = accounts
            .map(a => a.quota?.models.find(m => m.name.toLowerCase() === 'gemini-3-pro-high')?.percentage || 0)
            .filter(q => q > 0);

        const geminiImageQuotas = accounts
            .map(a => a.quota?.models.find(m => m.name.toLowerCase() === 'gemini-3-pro-image')?.percentage || 0)
            .filter(q => q > 0);

        const claudeQuotas = accounts
            .map(a => a.quota?.models.find(m => m.name.toLowerCase() === 'claude-sonnet-4-5')?.percentage || 0)
            .filter(q => q > 0);

        const lowQuotaCount = accounts.filter(a => {
            if (a.quota?.is_forbidden) return false;
            const gemini = a.quota?.models.find(m => m.name.toLowerCase() === 'gemini-3-pro-high')?.percentage || 0;
            const claude = a.quota?.models.find(m => m.name.toLowerCase() === 'claude-sonnet-4-5')?.percentage || 0;
            return gemini < 20 || claude < 20;
        }).length;

        return {
            total: accounts.length,
            avgGemini: geminiQuotas.length > 0
                ? Math.round(geminiQuotas.reduce((a, b) => a + b, 0) / geminiQuotas.length)
                : 0,
            avgGeminiImage: geminiImageQuotas.length > 0
                ? Math.round(geminiImageQuotas.reduce((a, b) => a + b, 0) / geminiImageQuotas.length)
                : 0,
            avgClaude: claudeQuotas.length > 0
                ? Math.round(claudeQuotas.reduce((a, b) => a + b, 0) / claudeQuotas.length)
                : 0,
            lowQuota: lowQuotaCount,
        };
    }, [accounts]);

    const isSwitchingRef = useRef(false);

    // Handlers (Memoized)
    const handleSwitch = useCallback(async (accountId: string) => {
        if (isSwitchingRef.current) return;

        isSwitchingRef.current = true;
        try {
            await switchAccount(accountId);
            showToast(t('dashboard.toast.switch_success'), 'success');
        } catch (error) {
            console.error('切换账号失败:', error);
            showToast(`${t('dashboard.toast.switch_error')}: ${error}`, 'error');
        } finally {
            setTimeout(() => {
                isSwitchingRef.current = false;
            }, 500);
        }
    }, [switchAccount, t]);

    const handleAddAccount = useCallback(async (email: string, refreshToken: string) => {
        await addAccount({ email, refreshToken });
        // Invalidation handled by mutation hook
    }, [addAccount]);

    const handleRefreshCurrent = useCallback(async () => {
        if (!currentAccount) return;
        
        try {
            await refreshQuota(currentAccount.id);
            // Invalidation handled by mutation hook
        } catch (error) {
            console.error('[Dashboard] Refresh failed:', error);
        }
    }, [currentAccount, refreshQuota]);

    const exportAccountsToJson = useCallback(async (accountsToExport: Account[]) => {
        try {
            if (!accountsToExport || accountsToExport.length === 0) {
                showToast(t('dashboard.toast.export_no_accounts'), 'warning');
                return;
            }

            const exportData = accountsToExport.map(acc => ({
                email: acc.email,
                refresh_token: acc.token.refresh_token
            }));
            const content = JSON.stringify(exportData, null, 2);
            const fileName = `antigravity_accounts_${new Date().toISOString().split('T')[0]}.json`;

            if (isTauri()) {
                const path = await save({
                    filters: [{
                        name: 'JSON',
                        extensions: ['json']
                    }],
                    defaultPath: fileName
                });

                if (!path) return;

                await invoke('save_text_file', { path, content });
                showToast(t('dashboard.toast.export_success', { path }), 'success');
            } else {
                const blob = new Blob([content], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast(t('dashboard.toast.export_success', { path: fileName }), 'success');
            }
        } catch (error: any) {
            console.error('Export failed:', error);
            showToast(`${t('dashboard.toast.export_error')}: ${error.toString()}`, 'error');
        }
    }, [t]);

    const handleExport = useCallback(() => {
        exportAccountsToJson(accounts);
    }, [accounts, exportAccountsToJson]);

    if (isLoadingAccounts && !accounts?.length) {
        return <DashboardSkeleton />;
    }
    
    // Safely verify if accounts exist before rendering main content
    if (!accounts) return null;

    return (
        <motion.div 
            className="h-full w-full overflow-y-auto bg-zinc-50 dark:bg-zinc-950 p-8 space-y-8 pb-32"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
        >
            <div className="max-w-[1400px] mx-auto space-y-10">
                {/* Header Section */}
                <motion.div variants={itemVariants} className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-zinc-100 flex items-center gap-2">
                            <div className="p-1.5 bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/30 text-white">
                                <LayoutDashboard className="w-5 h-5" />
                            </div>
                            {t('dashboard.hello', { user: currentAccount ? (currentAccount.name || currentAccount.email.split('@')[0]) : 'User' })}
                        </h1>
                    </div>

                    
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 shadow-sm h-9"
                            onClick={handleRefreshCurrent}
                            disabled={isRefreshing || !currentAccount}
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                            {isRefreshing ? t('dashboard.refreshing') : t('dashboard.refresh_quota')}
                        </Button>
                        <AddAccountDialog onAdd={handleAddAccount} />
                    </div>
                </motion.div>

                {/* Stats Row (New Premium Design) */}
                <motion.div variants={itemVariants}>
                    <StatsRow stats={stats} />
                </motion.div>

                {/* Main Content Grid */}
                <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column: Current Account (7 cols) */}
                    <div className="lg:col-span-7 flex flex-col gap-4">
                        <CurrentAccount
                            account={currentAccount}
                            onSwitch={() => navigate('/accounts')}
                        />
                        
                        {/* Quick Actions Bar Refactored */}
                        <Card className="flex items-center justify-between p-3 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-sm border-zinc-200 dark:border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-md text-indigo-600 dark:text-indigo-400">
                                    <Users size={16} />
                                </div>
                                <div className="hidden sm:block">
                                    <div className="text-xs font-bold text-zinc-900 dark:text-zinc-200 uppercase tracking-wider">Account Pool</div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={handleExport} className="gap-2 h-8">
                                    <Download size={14} />
                                    {t('dashboard.export_data')}
                                </Button>
                                <Button onClick={() => navigate('/accounts')} size="sm" className="gap-2 h-8">
                                    <span>{t('dashboard.view_all_accounts')}</span>
                                    <ArrowRight size={14} />
                                </Button>
                            </div>
                        </Card>
                    </div>

                    {/* Right Column: Recommendations (5 cols) */}
                    <div className="lg:col-span-5 h-full min-h-[400px]">
                        <BestAccounts
                            accounts={accounts}
                            currentAccountId={currentAccount?.id}
                            onSwitch={handleSwitch}
                        />
                    </div>
                </motion.div>
            </div>
        </motion.div>
    );
}

export default Dashboard;
