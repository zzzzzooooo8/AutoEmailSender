import type { Profile } from '@/types';

// 持久化到 localStorage（生产环境应替换为真实后端）
const STORAGE_KEY = 'profiles_data';

export const loadProfiles = (): Profile[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveProfiles = (profiles: Profile[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
};

export const getProfiles = async (): Promise<Profile[]> => {
  await new Promise((r) => setTimeout(r, 200));
  return loadProfiles();
};

export const getProfile = async (id: string): Promise<Profile | null> => {
  await new Promise((r) => setTimeout(r, 100));
  const profiles = loadProfiles();
  return profiles.find((p) => p.id === id) ?? null;
};

export const createProfile = async (data: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>): Promise<Profile> => {
  await new Promise((r) => setTimeout(r, 300));
  const profiles = loadProfiles();
  const now = new Date().toISOString();
  const newProfile: Profile = {
    ...data,
    id: `p-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  };
  profiles.push(newProfile);
  saveProfiles(profiles);
  return newProfile;
};

export const updateProfile = async (id: string, data: Partial<Profile>): Promise<Profile> => {
  await new Promise((r) => setTimeout(r, 300));
  const profiles = loadProfiles();
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error('Profile not found');

  const updated: Profile = {
    ...profiles[idx],
    ...data,
    id, // preserve original id
    updatedAt: new Date().toISOString(),
  };
  profiles[idx] = updated;
  saveProfiles(profiles);
  return updated;
};

export const deleteProfile = async (id: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 200));
  const profiles = loadProfiles();
  saveProfiles(profiles.filter((p) => p.id !== id));
};

export const setDefaultProfile = async (id: string): Promise<void> => {
  await new Promise((r) => setTimeout(r, 100));
  const profiles = loadProfiles();
  profiles.forEach((p) => {
    p.isDefault = p.id === id;
  });
  saveProfiles(profiles);
};
