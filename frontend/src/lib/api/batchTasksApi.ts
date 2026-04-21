import { apiFetch } from '@/lib/api/client';
import type {
  BatchTaskCardDTO,
  CreateBatchTaskRequestDTO,
} from '@/types';

export const listBatchTasks = (params?: {
  identityId?: number | null;
  llmProfileId?: number | null;
}) =>
  apiFetch<BatchTaskCardDTO[]>(
    '/api/batch-tasks',
    undefined,
    {
      identity_id: params?.identityId ?? undefined,
      llm_profile_id: params?.llmProfileId ?? undefined,
    },
  );

export const createBatchTask = (payload: CreateBatchTaskRequestDTO) =>
  apiFetch<BatchTaskCardDTO>('/api/batch-tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const pauseBatchTask = (taskId: number) =>
  apiFetch<{ ok: boolean; task: BatchTaskCardDTO }>(`/api/batch-tasks/${taskId}/pause`, {
    method: 'POST',
  });

export const resumeBatchTask = (taskId: number) =>
  apiFetch<{ ok: boolean; task: BatchTaskCardDTO }>(`/api/batch-tasks/${taskId}/resume`, {
    method: 'POST',
  });

export const stopBatchTask = (taskId: number) =>
  apiFetch<{ ok: boolean; task: BatchTaskCardDTO }>(`/api/batch-tasks/${taskId}/stop`, {
    method: 'POST',
  });
