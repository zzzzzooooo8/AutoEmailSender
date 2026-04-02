import { useState } from 'react';
import { ChevronDown, ChevronUp, Upload, X, UserCircle, ShieldCheck } from 'lucide-react';
import type { Profile, SmtpConfig, ImapConfig, ResumeFile } from '@/types';

interface ProfileFormProps {
  initialProfile?: Profile;
  isNew?: boolean;
  errors: Record<string, string>;
  onSave: (data: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

const defaultSmtp = (): SmtpConfig => ({
  host: '',
  port: 587,
  username: '',
  password: '',
  fromEmail: '',
  fromName: '',
  useTLS: true,
});

const defaultImap = (): ImapConfig => ({
  host: '',
  port: 993,
  username: '',
  password: '',
  useSSL: true,
});

export const ProfileForm: React.FC<ProfileFormProps> = ({
  initialProfile,
  isNew,
  errors,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState(initialProfile?.name ?? '');
  const [title, setTitle] = useState(initialProfile?.title ?? '');
  const [direction, setDirection] = useState(initialProfile?.direction ?? '');
  const [avatar, setAvatar] = useState(initialProfile?.avatar ?? '');
  const [smtp, setSmtp] = useState<SmtpConfig>(initialProfile?.smtp ?? defaultSmtp());
  const [imap, setImap] = useState<ImapConfig | undefined>(initialProfile?.imap ?? undefined);
  const [resumes, setResumes] = useState<ResumeFile[]>(initialProfile?.resumes ?? []);
  const [isDefault, setIsDefault] = useState(initialProfile?.isDefault ?? false);

  const [smtpOpen, setSmtpOpen] = useState(true);
  const [imapOpen, setImapOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(true);

  const updateSmtp = (field: keyof SmtpConfig, value: string | number | boolean) => {
    setSmtp((prev) => ({ ...prev, [field]: value }));
  };

  const updateImap = (field: keyof ImapConfig, value: string | number | boolean) => {
    setImap((prev) => {
      if (!prev) return defaultImap();
      return { ...prev, [field]: value };
    });
  };

  const handleAddResume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newResumes: ResumeFile[] = files.map((f) => ({
      name: f.name,
      size: f.size,
      url: URL.createObjectURL(f),
    }));
    setResumes((prev) => [...prev, ...newResumes]);
    e.target.value = '';
  };

  const handleRemoveResume = (index: number) => {
    setResumes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (errors && Object.keys(errors).length > 0) return;
    onSave({
      name,
      title,
      direction,
      avatar,
      smtp,
      imap,
      resumes,
      isDefault,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 基本信息 */}
      <SectionCard title="基本信息" icon={<UserCircle className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="身份名称" error={errors.name} required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：王俊杰"
              className="form-input"
            />
          </FormField>
          <FormField label="身份描述" error={errors.title}>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：华东师范大学 · 计算机硕士"
              className="form-input"
            />
          </FormField>
        </div>
        <FormField label="方向标签" error={errors.direction} required>
          <input
            type="text"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            placeholder="例如：AI Agent / 大模型微调"
            className="form-input"
          />
        </FormField>
        <FormField label="头像 URL" error={errors.avatar}>
          <input
            type="url"
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            placeholder="https://..."
            className="form-input"
          />
        </FormField>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-4 w-4 rounded border-stone-300 text-primary accent-primary"
          />
          <span className="text-sm text-stone-600">设为默认发件身份</span>
        </label>
      </SectionCard>

      {/* SMTP 发件配置 */}
      <SectionCard
        title="发件服务器（SMTP）"
        icon={<ShieldCheck className="h-4 w-4" />}
        isOpen={smtpOpen}
        onToggle={() => setSmtpOpen((p) => !p)}
        error={errors.smtp}
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="SMTP 主机" error={errors['smtp.host']} required>
            <input
              type="text"
              value={smtp.host}
              onChange={(e) => updateSmtp('host', e.target.value)}
              placeholder="smtp.gmail.com"
              className="form-input"
            />
          </FormField>
          <FormField label="端口" error={errors['smtp.port']} required>
            <input
              type="number"
              value={smtp.port}
              onChange={(e) => updateSmtp('port', parseInt(e.target.value, 10) || 0)}
              placeholder="587"
              className="form-input"
            />
          </FormField>
          <FormField label="用户名 / 邮箱" error={errors['smtp.username']} required>
            <input
              type="text"
              value={smtp.username}
              onChange={(e) => updateSmtp('username', e.target.value)}
              placeholder="your@email.com"
              className="form-input"
            />
          </FormField>
          <FormField label="密码 / 授权码" error={errors['smtp.password']} required>
            <input
              type="password"
              value={smtp.password}
              onChange={(e) => updateSmtp('password', e.target.value)}
              placeholder="填写密码或授权码"
              className="form-input"
            />
          </FormField>
          <FormField label="发件人姓名" error={errors['smtp.fromName']} required>
            <input
              type="text"
              value={smtp.fromName}
              onChange={(e) => updateSmtp('fromName', e.target.value)}
              placeholder="王俊杰"
              className="form-input"
            />
          </FormField>
          <FormField label="发件人邮箱" error={errors['smtp.fromEmail']} required>
            <input
              type="email"
              value={smtp.fromEmail}
              onChange={(e) => updateSmtp('fromEmail', e.target.value)}
              placeholder="your@email.com"
              className="form-input"
            />
          </FormField>
        </div>
        <label className="flex items-center gap-2 cursor-pointer mt-1">
          <input
            type="checkbox"
            checked={smtp.useTLS}
            onChange={(e) => updateSmtp('useTLS', e.target.checked)}
            className="h-4 w-4 rounded border-stone-300 text-primary accent-primary"
          />
          <span className="text-sm text-stone-600">使用 TLS（端口 587 通常需要开启）</span>
        </label>
      </SectionCard>

      {/* IMAP 收件配置 */}
      <SectionCard
        title="收件服务器（IMAP）"
        icon={<ShieldCheck className="h-4 w-4" />}
        isOpen={imapOpen}
        onToggle={() => setImapOpen((p) => !p)}
        optional
      >
        <p className="text-xs text-stone-400 mb-3 -mt-1">用于自动检测导师回复，支持留空（暂不开启）</p>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="IMAP 主机" error={errors['imap.host']}>
            <input
              type="text"
              value={imap?.host ?? ''}
              onChange={(e) => updateImap('host', e.target.value)}
              placeholder="imap.gmail.com"
              className="form-input"
            />
          </FormField>
          <FormField label="端口" error={errors['imap.port']}>
            <input
              type="number"
              value={imap?.port ?? 993}
              onChange={(e) => updateImap('port', parseInt(e.target.value, 10) || 0)}
              placeholder="993"
              className="form-input"
            />
          </FormField>
          <FormField label="用户名 / 邮箱" error={errors['imap.username']}>
            <input
              type="text"
              value={imap?.username ?? ''}
              onChange={(e) => updateImap('username', e.target.value)}
              placeholder="your@email.com"
              className="form-input"
            />
          </FormField>
          <FormField label="密码 / 授权码" error={errors['imap.password']}>
            <input
              type="password"
              value={imap?.password ?? ''}
              onChange={(e) => updateImap('password', e.target.value)}
              placeholder="填写密码或授权码"
              className="form-input"
            />
          </FormField>
        </div>
        <label className="flex items-center gap-2 cursor-pointer mt-1">
          <input
            type="checkbox"
            checked={imap?.useSSL ?? true}
            onChange={(e) => updateImap('useSSL', e.target.checked)}
            className="h-4 w-4 rounded border-stone-300 text-primary accent-primary"
          />
          <span className="text-sm text-stone-600">使用 SSL（端口 993 通常需要开启）</span>
        </label>
      </SectionCard>

      {/* 简历附件 */}
      <SectionCard
        title="简历附件"
        icon={<Upload className="h-4 w-4" />}
        isOpen={resumeOpen}
        onToggle={() => setResumeOpen((p) => !p)}
        optional
      >
        {resumes.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {resumes.map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 pr-2"
              >
                <span className="text-xs text-stone-600 max-w-[160px] truncate">{r.name}</span>
                <span className="text-xs text-stone-400">{formatBytes(r.size)}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveResume(i)}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="flex w-fit cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-500 transition-all hover:border-primary hover:bg-primary/5 hover:text-primary">
          <Upload className="h-4 w-4" />
          <span>上传简历</span>
          <input
            type="file"
            multiple
            onChange={handleAddResume}
            className="sr-only"
            accept=".pdf,.doc,.docx"
          />
        </label>
        <p className="text-xs text-stone-400 mt-2">支持 PDF、Word 格式，可上传多份（针对不同方向）</p>
      </SectionCard>

      {/* 操作按钮 */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-stone-100">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-stone-200 bg-white px-5 py-2.5 text-sm font-medium text-stone-600 transition-all hover:border-stone-300 hover:bg-stone-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary/90 hover:shadow-md"
        >
          {isNew ? '创建身份' : '保存修改'}
        </button>
      </div>
    </div>
  );
};

// --- Sub-components ---

interface SectionCardProps {
  title: string;
  icon: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
}

const SectionCard: React.FC<SectionCardProps> = ({
  title,
  icon,
  isOpen,
  onToggle,
  error,
  optional,
  children,
}) => (
  <div className={`rounded-2xl border border-stone-200 bg-[#FCFBF8] shadow-sm transition-all ${error ? 'border-red-300' : ''}`}>
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between px-5 py-4 text-left"
    >
      <div className="flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <span className="font-semibold text-stone-700">{title}</span>
        {optional && <span className="text-xs text-stone-400 font-normal">（可选）</span>}
        {error && <span className="text-xs text-red-500 font-normal ml-1">{error}</span>}
      </div>
      {isOpen ? (
        <ChevronUp className="h-4 w-4 text-stone-400" />
      ) : (
        <ChevronDown className="h-4 w-4 text-stone-400" />
      )}
    </button>
    {isOpen && <div className="px-5 pb-5">{children}</div>}
  </div>
);

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactElement<HTMLInputElement>;
}

const FormField: React.FC<FormFieldProps> = ({ label, error, required, children }) => (
  <div className="flex flex-col gap-1">
    <label className="text-xs font-medium text-stone-500">
      {label}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
    {error && <span className="text-xs text-red-500">{error}</span>}
  </div>
);

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
