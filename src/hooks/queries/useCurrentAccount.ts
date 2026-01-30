import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as accountService from '../../services/accountService';
import { ACCOUNT_KEYS } from './useAccounts';
import { showToast } from '../../components/common/ToastContainer';
import { useTranslation } from 'react-i18next';

export function useCurrentAccount() {
    const queryClient = useQueryClient();
    const { t } = useTranslation();

    const currentAccountQuery = useQuery({
        queryKey: ACCOUNT_KEYS.current,
        queryFn: accountService.getCurrentAccount,
    });

    const refreshQuotaMutation = useMutation({
        mutationFn: (accountId: string) => accountService.fetchAccountQuota(accountId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ACCOUNT_KEYS.current });
            queryClient.invalidateQueries({ queryKey: ACCOUNT_KEYS.all });
            showToast(t('dashboard.toast.refresh_success', 'Quota refreshed successfully'), 'success');
        },
        onError: (error: any) => {
            showToast(`${t('dashboard.toast.refresh_error', 'Failed to refresh quota')}: ${error}`, 'error');
        }
    });

    return {
        currentAccount: currentAccountQuery.data,
        isLoading: currentAccountQuery.isLoading,
        error: currentAccountQuery.error,
        refreshQuota: refreshQuotaMutation.mutateAsync,
        isRefreshing: refreshQuotaMutation.isPending,
    };
}
