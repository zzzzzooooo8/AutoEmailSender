import { apiFetch } from "@/lib/api/client";

export interface RuntimeSettingsDTO {
  match_analysis_job_worker_count: number;
  match_analysis_job_item_concurrency: number;
  match_analysis_job_interval_seconds: number;
  crawler_worker_count: number;
  crawler_profile_enrichment_concurrency: number;
  crawler_host_concurrency: number;
  updated_at: string;
}

export type RuntimeSettingsUpdateDTO = Omit<RuntimeSettingsDTO, "updated_at">;

export const getRuntimeSettings = () =>
  apiFetch<RuntimeSettingsDTO>("/api/runtime-settings");

export const updateRuntimeSettings = (payload: RuntimeSettingsUpdateDTO) =>
  apiFetch<RuntimeSettingsDTO>("/api/runtime-settings", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
