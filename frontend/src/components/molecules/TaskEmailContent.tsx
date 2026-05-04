import { Mail } from 'lucide-react';
import type { EmailContent } from '@/features/create-task/types';

interface TaskEmailContentProps {
  emailContent: EmailContent;
  onUpdate: (field: keyof EmailContent, value: string) => void;
}

export const TaskEmailContent: React.FC<TaskEmailContentProps> = ({ emailContent, onUpdate }) => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-stone-700">邮件内容</span>
      </div>

      {/* 邮件主题 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-stone-500">邮件主题</label>
        <input
          type="text"
          value={emailContent.subject}
          onChange={(e) => onUpdate('subject', e.target.value)}
          placeholder="例如：系统架构方向交流 - 致 XX 教授"
          className="h-10 w-full rounded-xl border border-stone-200 bg-white px-4 text-sm text-stone-700 outline-none transition-all placeholder:text-stone-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* 邮件正文 */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-stone-500">邮件正文</label>
        <textarea
          value={emailContent.body}
          onChange={(e) => onUpdate('body', e.target.value)}
          placeholder="在此编写邮件正文，支持简要变量占位符（如 &#123;&#123;导师姓名&#125;&#125; 将在发送时自动替换）"
          rows={8}
          className="w-full resize-none rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 outline-none transition-all placeholder:text-stone-400 focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <span className="text-xs text-stone-400">
          提示：&#123;&#123;导师姓名&#125;&#125;、&#123;&#123;学校&#125;&#125;、&#123;&#123;研究方向&#125;&#125; 等占位符将在发送时自动替换
        </span>
      </div>
    </div>
  );
};
