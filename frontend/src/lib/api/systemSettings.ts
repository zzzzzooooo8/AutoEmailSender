import { apiFetch } from '@/lib/api/client';
import type { MailDeliveryMode, SystemSettingsDTO } from '@/types';

export const getSystemSettings = () =>
  apiFetch<SystemSettingsDTO>('/api/system-settings');

export const updateSystemSettings = (mailDeliveryMode: MailDeliveryMode) =>
  apiFetch<SystemSettingsDTO>('/api/system-settings', {
    method: 'PATCH',
    body: JSON.stringify({ mail_delivery_mode: mailDeliveryMode }),
  });
