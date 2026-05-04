import { apiFetch } from '@/lib/api/client';
import type { WorkspaceThreadDTO } from '@/types';

export const getWorkspaceThread = (
  professorId: number,
  identityId: number,
  llmProfileId: number,
) =>
  apiFetch<WorkspaceThreadDTO>(
    `/api/workspaces/${professorId}`,
    undefined,
    {
      identity_id: identityId,
      llm_profile_id: llmProfileId,
    },
  );

export const ensureWorkspaceTask = (
  professorId: number,
  identityId: number,
  llmProfileId: number,
) =>
  apiFetch<WorkspaceThreadDTO>(
    `/api/workspaces/${professorId}/ensure-task`,
    {
      method: 'POST',
    },
    {
      identity_id: identityId,
      llm_profile_id: llmProfileId,
    },
  );
