import { apiFetch } from '@/lib/api/client';
import type {
  TestComposeDraftPayloadDTO,
  TestComposeStatusDTO,
  TestComposeThreadDTO,
} from '@/types';

export const getTestComposeStatus = (identityId: number) =>
  apiFetch<TestComposeStatusDTO>(`/api/test-compose/${identityId}/status`);

export const getTestComposeThread = (identityId: number, llmProfileId: number) =>
  apiFetch<TestComposeThreadDTO>(`/api/test-compose/${identityId}/${llmProfileId}`);

export const generateTestComposeDraft = (identityId: number, llmProfileId: number) =>
  apiFetch<TestComposeThreadDTO>(`/api/test-compose/${identityId}/${llmProfileId}/generate-draft`, {
    method: 'POST',
  });

export const saveTestComposeDraft = (
  identityId: number,
  llmProfileId: number,
  payload: TestComposeDraftPayloadDTO,
) =>
  apiFetch<TestComposeThreadDTO>(`/api/test-compose/${identityId}/${llmProfileId}/draft`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const sendTestComposeMessage = (
  identityId: number,
  llmProfileId: number,
  payload: TestComposeDraftPayloadDTO,
) =>
  apiFetch<TestComposeThreadDTO>(`/api/test-compose/${identityId}/${llmProfileId}/send`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
