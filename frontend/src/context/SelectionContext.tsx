/* eslint-disable react-refresh/only-export-components */

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useNotification } from '@/context/NotificationContext';
import { listIdentities } from '@/lib/api/identities';
import { listLLMProfiles } from '@/lib/api/llmProfiles';
import type {
  IdentityDTO,
  LLMProfileDTO,
} from '@/types';

interface SelectionContextValue {
  identities: IdentityDTO[];
  llmProfiles: LLMProfileDTO[];
  selectedIdentityId: number | null;
  selectedLlmProfileId: number | null;
  selectedIdentity: IdentityDTO | null;
  selectedLlmProfile: LLMProfileDTO | null;
  loading: boolean;
  setSelectedIdentityId: (value: number | null) => void;
  setSelectedLlmProfileId: (value: number | null) => void;
  refreshSelections: () => Promise<void>;
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
  const { notifyError } = useNotification();
  const [identities, setIdentities] = useState<IdentityDTO[]>([]);
  const [llmProfiles, setLlmProfiles] = useState<LLMProfileDTO[]>([]);
  const [selectedIdentityId, setSelectedIdentityId] = useState<number | null>(() =>
    parseStoredId(IDENTITY_STORAGE_KEY),
  );
  const [selectedLlmProfileId, setSelectedLlmProfileId] = useState<number | null>(() =>
    parseStoredId(LLM_STORAGE_KEY),
  );
  const [loading, setLoading] = useState(true);
  const bootstrappedRef = useRef(false);

  const refreshSelections = useCallback(async () => {
    if (!bootstrappedRef.current) {
      setLoading(true);
    }
    try {
      const [identityData, llmData] = await Promise.all([
        listIdentities(),
        listLLMProfiles(),
      ]);
      setIdentities(identityData);
      setLlmProfiles(llmData);
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : '加载全局上下文失败';
      notifyError('加载全局上下文失败', message);
    } finally {
      setLoading(false);
      bootstrappedRef.current = true;
    }
  }, [notifyError]);

  useEffect(() => {
    void refreshSelections();
  }, [refreshSelections]);

  useEffect(() => {
    if (loading) {
      return;
    }
    if (
      selectedIdentityId !== null &&
      identities.some((item) => item.id === selectedIdentityId)
    ) {
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
    if (
      selectedLlmProfileId !== null &&
      llmProfiles.some((item) => item.id === selectedLlmProfileId)
    ) {
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

  const value: SelectionContextValue = {
    identities,
    llmProfiles,
    selectedIdentityId,
    selectedLlmProfileId,
    selectedIdentity: identities.find((item) => item.id === selectedIdentityId) ?? null,
    selectedLlmProfile: llmProfiles.find((item) => item.id === selectedLlmProfileId) ?? null,
    loading,
    setSelectedIdentityId,
    setSelectedLlmProfileId,
    refreshSelections,
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
