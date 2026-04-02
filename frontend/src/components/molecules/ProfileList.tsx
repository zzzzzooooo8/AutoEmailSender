import { UserCircle, Plus, Star } from 'lucide-react';
import type { Profile } from '@/types';

interface ProfileListProps {
  profiles: Profile[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}

export const ProfileList: React.FC<ProfileListProps> = ({
  profiles,
  selectedId,
  onSelect,
  onAdd,
  onDelete,
  onSetDefault,
}) => {
  return (
    <div className="flex flex-col gap-3">
      {/* 新增按钮 */}
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-2 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 px-4 py-3 text-sm font-medium text-stone-500 transition-all hover:border-primary hover:bg-primary/5 hover:text-primary w-full"
      >
        <Plus className="h-4 w-4" />
        新增身份
      </button>

      {/* 身份卡片列表 */}
      {profiles.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-stone-400">
          <UserCircle className="h-10 w-10" />
          <p className="text-sm">暂无身份，请新增一个</p>
        </div>
      )}

      {profiles.map((profile) => {
        const isSelected = profile.id === selectedId;
        return (
          <div
            key={profile.id}
            onClick={() => onSelect(profile.id)}
            className={`group relative flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all ${
              isSelected
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-stone-200 bg-[#FCFBF8] hover:border-stone-300 hover:shadow-sm'
            }`}
          >
            {/* 头像 */}
            {profile.avatar ? (
              <img
                src={profile.avatar}
                alt={profile.name}
                className="h-10 w-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-200">
                <UserCircle className="h-6 w-6 text-stone-400" />
              </div>
            )}

            {/* 信息 */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-stone-800 truncate">{profile.name}</span>
                {profile.isDefault && (
                  <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                )}
              </div>
              <p className="text-xs text-stone-500 truncate">{profile.direction}</p>
              <p className="text-xs text-stone-400 truncate mt-0.5">{profile.smtp.fromEmail}</p>
            </div>

            {/* 操作按钮（hover 显示） */}
            <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!profile.isDefault && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSetDefault(profile.id); }}
                  title="设为默认"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-stone-400 hover:bg-stone-200 hover:text-amber-500"
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(profile.id); }}
                title="删除"
                className="flex h-6 w-6 items-center justify-center rounded-md text-stone-400 hover:bg-red-50 hover:text-red-500"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
