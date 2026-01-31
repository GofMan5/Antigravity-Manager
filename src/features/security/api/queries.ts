// File: src/features/security/api/queries.ts
// React Query hooks for security

import { useQuery } from '@tanstack/react-query';
import { invoke } from '@/shared/api';
import { securityKeys } from './keys';

// Types (from entities/security or inline)
export interface IpEntry {
  id: string;
  ip: string;
  reason?: string;
  created_at: number;
  expires_at?: number;
}

export interface AccessLog {
  id: string;
  ip: string;
  timestamp: number;
  action: 'allowed' | 'blocked';
  reason?: string;
  path?: string;
}

export interface SecuritySettings {
  ip_filter_enabled: boolean;
  default_policy: 'allow' | 'deny';
  log_blocked_requests: boolean;
}

// Query hooks
export function useBlacklist() {
  return useQuery({
    queryKey: securityKeys.blacklist(),
    queryFn: () => invoke<IpEntry[]>('security_get_blacklist'),
  });
}

export function useWhitelist() {
  return useQuery({
    queryKey: securityKeys.whitelist(),
    queryFn: () => invoke<IpEntry[]>('security_get_whitelist'),
  });
}

export function useAccessLogs(filters?: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: securityKeys.accessLogs(filters),
    queryFn: () => invoke<AccessLog[]>('security_get_access_logs', filters),
  });
}

export function useSecuritySettings() {
  return useQuery({
    queryKey: securityKeys.settings(),
    queryFn: () => invoke<SecuritySettings>('security_get_settings'),
  });
}
