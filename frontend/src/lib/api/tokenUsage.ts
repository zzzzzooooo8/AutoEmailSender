import { apiFetch } from '@/lib/api/client';
import type { TokenUsageRecordListDTO } from '@/types';

export const listTokenUsageRecords = (limit = 20) =>
  apiFetch<TokenUsageRecordListDTO>('/api/token-usage/records', undefined, {
    limit,
  });
