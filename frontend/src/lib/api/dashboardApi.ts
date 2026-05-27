import { apiFetch } from '@/lib/api/client';
import type { DashboardOverviewDTO } from '@/types';

export const getDashboardOverview = (params: {
  identityId: number;
  llmProfileId: number;
  university?: string | null;
  school?: string | null;
  emailUniversity?: string | null;
  emailSchool?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) =>
  apiFetch<DashboardOverviewDTO>('/api/dashboard/overview', undefined, {
    identity_id: params.identityId,
    llm_profile_id: params.llmProfileId,
    university: params.university || undefined,
    school: params.school || undefined,
    email_university: params.emailUniversity || undefined,
    email_school: params.emailSchool || undefined,
    start_date: params.startDate || undefined,
    end_date: params.endDate || undefined,
  });
