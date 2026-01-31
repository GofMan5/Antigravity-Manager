// File: src/features/security/api/mutations.ts
// React Query mutations for security

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@/shared/api';
import { securityKeys } from './keys';
import { showToast } from '@/components/common/ToastContainer';
import { useTranslation } from 'react-i18next';
import type { SecuritySettings } from './queries';

// Mutations
export function useAddToBlacklist() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (data: { ip: string; reason?: string; expires_at?: number }) =>
      invoke<void>('security_add_to_blacklist', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: securityKeys.blacklist() });
      showToast(t('security.toast.added_blacklist', 'Added to blacklist'), 'success');
    },
    onError: (error) => {
      showToast(`Failed: ${error}`, 'error');
    },
  });
}

export function useAddToWhitelist() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (data: { ip: string; reason?: string }) =>
      invoke<void>('security_add_to_whitelist', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: securityKeys.whitelist() });
      showToast(t('security.toast.added_whitelist', 'Added to whitelist'), 'success');
    },
  });
}

export function useRemoveFromBlacklist() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (id: string) => invoke<void>('security_remove_from_blacklist', { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: securityKeys.blacklist() });
      showToast(t('security.toast.removed', 'Removed'), 'success');
    },
  });
}

export function useRemoveFromWhitelist() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (id: string) => invoke<void>('security_remove_from_whitelist', { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: securityKeys.whitelist() });
      showToast(t('security.toast.removed', 'Removed'), 'success');
    },
  });
}

export function useClearAccessLogs() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: () => invoke<void>('security_clear_access_logs'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: securityKeys.accessLogs() });
      showToast(t('security.toast.logs_cleared', 'Logs cleared'), 'success');
    },
  });
}

export function useUpdateSecuritySettings() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (settings: SecuritySettings) =>
      invoke<void>('security_update_settings', { settings }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: securityKeys.settings() });
      showToast(t('common.saved', 'Settings saved'), 'success');
    },
  });
}
