/* eslint-disable react-refresh/only-export-components */

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { listIdentities } from '@/lib/api/identities';
import { listLLMProfiles } from '@/lib/api/llmProfiles';
import { getSystemSettings, updateSystemSettings } from '@/lib/api/systemSettings';
import type {
  IdentityDTO,
  LLMProfileDTO,
  MailDeliveryMode,
  SystemSettingsDTO,
} from '@/types';

interface SelectionContextValue {
  identities: IdentityDTO[];
  llmProfiles: LLMProfileDTO[];
  systemSettings: SystemSettingsDTO | null;
  selectedIdentityId: number | null;
  selectedLlmProfileId: number | null;
  selectedIdentity: IdentityDTO | null;
  selectedLlmProfile: LLMProfileDTO | null;
  loading: boolean;
  updatingMode: boolean;
  error: string | null;
  setSelectedIdentityId: (value: number | null) => void;
  setSelectedLlmProfileId: (value: number | null) => void;
  refreshSelections: () => Promise<void>;
  setMailDeliveryMode: (value: MailDeliveryMode) => Promise<void>;
}

const IDENTITY_STORAGE_KEY = 'selected_identity_id';
const LLM_STORAGE_KEY = 'selected_llm_profile_id';

const SelectionContext = createContext<SelectionContextValue | null>(null);

const parseStoredId = (key: string) => {
  const value = window.localStorage.getItem(key);
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const SelectionProvider = ({ children }: PropsWithChildren) => {
  const [identities, setIdentities] = useState<IdentityDTO[]>([]);
  const [llmProfiles, setLlmProfiles] = useState<LLMProfileDTO[]>([]);
  const [systemSettings, setSystemSettings] = useState<SystemSettingsDTO | null>(null);
  const [selectedIdentityId, setSelectedIdentityId] = useState<number | null>(null);
  const [selectedLlmProfileId, setSelectedLlmProfileId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [updatingMode, setUpdatingMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSelections = useCallback(async () => {
    if (!bootstrapped) {
      setLoading(true);
    }
    try {
      const [identityData, llmData, settingsData] = await Promise.all([
        listIdentities(),
        listLLMProfiles(),
        getSystemSettings(),
      ]);
      setIdentities(identityData);
      setLlmProfiles(llmData);
      setSystemSettings(settingsData);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : '加载全局上下文失败');
    } finally {
      setLoading(false);
      setBootstrapped(true);
    }
  }, [bootstrapped]);

  useEffect(() => {
    void refreshSelections();
  }, [refreshSelections]);

  useEffect(() => {
    if (loading) {
      return;
    }
    const stored = parseStoredId(IDENTITY_STORAGE_KEY);
    const fallbackId =
      identities.find((item) => item.id === stored)?.id ??
      identities.find((item) => item.is_default)?.id ??
      identities[0]?.id ??
      null;
    if (fallbackId !== selectedIdentityId) {
      setSelectedIdentityId(fallbackId);
    }
  }, [identities, loading, selectedIdentityId]);

  useEffect(() => {
    if (loading) {
      return;
    }
    const stored = parseStoredId(LLM_STORAGE_KEY);
    const fallbackId =
      llmProfiles.find((item) => item.id === stored)?.id ??
      llmProfiles.find((item) => item.is_default)?.id ??
      llmProfiles[0]?.id ??
      null;
    if (fallbackId !== selectedLlmProfileId) {
      setSelectedLlmProfileId(fallbackId);
    }
  }, [llmProfiles, loading, selectedLlmProfileId]);

  useEffect(() => {
    if (selectedIdentityId === null) {
      window.localStorage.removeItem(IDENTITY_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(IDENTITY_STORAGE_KEY, String(selectedIdentityId));
  }, [selectedIdentityId]);

  useEffect(() => {
    if (selectedLlmProfileId === null) {
      window.localStorage.removeItem(LLM_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(LLM_STORAGE_KEY, String(selectedLlmProfileId));
  }, [selectedLlmProfileId]);

  const setMailDeliveryMode = async (value: MailDeliveryMode) => {
    setUpdatingMode(true);
    try {
      const nextSettings = await updateSystemSettings(value);
      setSystemSettings(nextSettings);
      setError(null);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : '切换发送模式失败');
      throw updateError;
    } finally {
      setUpdatingMode(false);
    }
  };

  const value: SelectionContextValue = {
    identities,
    llmProfiles,
    systemSettings,
    selectedIdentityId,
    selectedLlmProfileId,
    selectedIdentity: identities.find((item) => item.id === selectedIdentityId) ?? null,
    selectedLlmProfile: llmProfiles.find((item) => item.id === selectedLlmProfileId) ?? null,
    loading,
    updatingMode,
    error,
    setSelectedIdentityId,
    setSelectedLlmProfileId,
    refreshSelections,
    setMailDeliveryMode,
  };

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
};

export const useSelectionContext = () => {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error('SelectionContext 未初始化');
  }
  return context;
};
