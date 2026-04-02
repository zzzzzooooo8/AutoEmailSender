import { useState, useEffect, useCallback } from 'react';
import { UserCircle } from 'lucide-react';
import { ProfileList } from '@/components/molecules/ProfileList';
import { ProfileForm } from '@/components/molecules/ProfileForm';
import { LLMConfigCard } from '@/components/molecules/LLMConfigCard';
import {
  getProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  setDefaultProfile,
} from '@/lib/api/profiles';
import { getLLMConfig } from '@/lib/api/llmConfig';
import type { Profile, LLMConfig } from '@/types';

export const ProfilePage: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [llmConfig, setLlmConfig] = useState<LLMConfig>({ model: 'openai' });
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [isCreating, setIsCreating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [profileData, llm] = await Promise.all([getProfiles(), getLLMConfig()]);
    setProfiles(profileData);
    setLlmConfig(llm);
    const def = profileData.find((p) => p.isDefault);
    setSelectedId(def?.id ?? profileData[0]?.id ?? undefined);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedProfile = profiles.find((p) => p.id === selectedId);

  const validate = (data: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>): boolean => {
    const errs: Record<string, string> = {};
    if (!data.name.trim()) errs.name = '请填写身份名称';
    if (!data.direction.trim()) errs.direction = '请填写方向标签';
    if (!data.smtp.host.trim()) errs['smtp.host'] = '请填写 SMTP 主机';
    if (!data.smtp.port) errs['smtp.port'] = '请填写端口';
    if (!data.smtp.username.trim()) errs['smtp.username'] = '请填写用户名';
    if (!data.smtp.password.trim()) errs['smtp.password'] = '请填写密码';
    if (!data.smtp.fromName.trim()) errs['smtp.fromName'] = '请填写发件人姓名';
    if (!data.smtp.fromEmail.trim()) errs['smtp.fromEmail'] = '请填写发件人邮箱';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async (data: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!validate(data)) return;
    try {
      if (isCreating) {
        const created = await createProfile(data);
        setProfiles((prev) => [...prev, created]);
        setSelectedId(created.id);
      } else if (selectedId) {
        const updated = await updateProfile(selectedId, data);
        setProfiles((prev) => prev.map((p) => (p.id === selectedId ? updated : p)));
      }
      setIsCreating(false);
      setErrors({});
    } catch {
      setErrors({ submit: '保存失败，请稍后重试' });
    }
  };

  const handleAdd = () => {
    setSelectedId(undefined);
    setIsCreating(true);
    setErrors({});
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setIsCreating(false);
    setErrors({});
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定要删除这个身份吗？')) return;
    await deleteProfile(id);
    setProfiles((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) {
      setSelectedId(profiles.find((p) => p.id !== id)?.id);
      setIsCreating(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    await setDefaultProfile(id);
    setProfiles((prev) =>
      prev.map((p) => ({
        ...p,
        isDefault: p.id === id,
      }))
    );
  };

  const handleCancel = () => {
    setIsCreating(false);
    setErrors({});
    if (profiles.length > 0) {
      setSelectedId(profiles.find((p) => p.isDefault)?.id ?? profiles[0].id);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-background">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* 页面标题 */}
        <div className="mb-6 flex items-center gap-3">
          <div className="bg-primary/10 rounded-xl p-2">
            <UserCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-stone-800">个人中心</h1>
            <p className="text-sm text-stone-500">管理发件身份、邮箱服务器与 AI 模型配置</p>
          </div>
        </div>

        {/* 全局 LLM 配置 */}
        <LLMConfigCard config={llmConfig} onUpdate={setLlmConfig} />

        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* 左侧：身份列表 */}
          <div className="w-full lg:w-80 shrink-0">
            <ProfileList
              profiles={profiles}
              selectedId={isCreating ? undefined : selectedId}
              onSelect={handleSelect}
              onAdd={handleAdd}
              onDelete={handleDelete}
              onSetDefault={handleSetDefault}
            />
          </div>

          {/* 右侧：身份详情 / 表单 */}
          <div className="flex-1 min-w-0">
            {isCreating || selectedProfile ? (
              <div className="rounded-2xl border border-stone-200 bg-[#FCFBF8] p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-2 border-b border-stone-100 pb-4">
                  <UserCircle className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-bold text-stone-800">
                    {isCreating ? '新增身份' : '编辑身份'}
                  </h2>
                </div>
                <ProfileForm
                  initialProfile={isCreating ? undefined : selectedProfile}
                  isNew={isCreating}
                  errors={errors}
                  onSave={handleSave}
                  onCancel={handleCancel}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-200 bg-[#FCFBF8] py-20 text-stone-400">
                <UserCircle className="mb-3 h-12 w-12" />
                <p className="text-sm">从左侧选择一个身份，或点击"新增身份"开始</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
