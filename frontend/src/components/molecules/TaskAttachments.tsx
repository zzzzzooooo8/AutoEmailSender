import { Paperclip, X, Upload } from 'lucide-react';
import type { Attachment } from '@/features/create-task/types';

interface TaskAttachmentsProps {
  attachments: Attachment[];
  onAdd: (files: Attachment[]) => void;
  onRemove: (index: number) => void;
}

export const TaskAttachments: React.FC<TaskAttachmentsProps> = ({
  attachments,
  onAdd,
  onRemove,
}) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newAttachments: Attachment[] = files.map((file) => ({
      name: file.name,
      size: file.size,
      url: URL.createObjectURL(file),
    }));
    onAdd(newAttachments);
    // Reset input
    e.target.value = '';
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-stone-700">附件</span>
        {attachments.length > 0 && (
          <span className="text-xs text-stone-400">（{attachments.length} 个文件）</span>
        )}
      </div>

      {/* 文件列表 */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((file, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 pr-2"
            >
              <span className="text-xs text-stone-600 max-w-[120px] truncate">{file.name}</span>
              <span className="text-xs text-stone-400">{formatSize(file.size)}</span>
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="flex h-4 w-4 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-200 hover:text-stone-600"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 上传按钮 */}
      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-500 transition-all hover:border-primary hover:bg-primary/5 hover:text-primary">
        <Upload className="h-4 w-4" />
        <span>添加附件</span>
        <input
          type="file"
          multiple
          onChange={handleFileChange}
          className="sr-only"
          accept="*/*"
        />
      </label>

      {attachments.length === 0 && (
        <span className="text-xs text-stone-400">
          支持 PDF、Word、图片等常见格式，单个文件不超过 10MB
        </span>
      )}
    </div>
  );
};