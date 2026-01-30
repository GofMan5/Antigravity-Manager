import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as accountService from '../../services/accountService';
import { showToast } from '../../components/common/ToastContainer';
import { useTranslation } from 'react-i18next';

export const ACCOUNT_KEYS = {
    all: ['accounts'] as const,
    detail: (id: string) => [...ACCOUNT_KEYS.all, id] as const,
    current: ['currentAccount'] as const,
};

export function useAccounts() {
    const queryClient = useQueryClient();
    const { t } = useTranslation();

    const accountsQuery = useQuery({
        queryKey: ACCOUNT_KEYS.all,
        queryFn: accountService.listAccounts,
        select: (data) => data.sort((a, b) => {
            // Sort by status (active first) then email
            if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
            return a.email.localeCompare(b.email);
        })
    });

    const addAccountMutation = useMutation({
        mutationFn: ({ email, refreshToken }: { email: string, refreshToken: string }) => 
            accountService.addAccount(email, refreshToken),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ACCOUNT_KEYS.all });
            showToast(t('dashboard.toast.add_success', 'Account added successfully'), 'success');
        },
        onError: (error: any) => {
            showToast(`${t('dashboard.toast.add_error', 'Failed to add account')}: ${error}`, 'error');
        }
    });

    const switchAccountMutation = useMutation({
        mutationFn: accountService.switchAccount,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ACCOUNT_KEYS.current });
            queryClient.invalidateQueries({ queryKey: ACCOUNT_KEYS.all }); // Refresh list to update UI states if needed
        }
    });

    return {
        accounts: accountsQuery.data || [],
        isLoading: accountsQuery.isLoading,
        error: accountsQuery.error,
        addAccount: addAccountMutation.mutateAsync,
        switchAccount: switchAccountMutation.mutateAsync,
        isAdding: addAccountMutation.isPending,
        isSwitching: switchAccountMutation.isPending,
    };
}
