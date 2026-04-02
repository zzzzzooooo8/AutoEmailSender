import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface WorkspaceHeaderProps {
  title: string;
  backUrl?: string;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({ title, backUrl = '/' }) => {
  return (
    <header className="h-16 flex items-center px-8 border-b border-stone-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
      <Link
        to={backUrl}
        className="flex items-center gap-1 text-stone-500 hover:text-primary transition-colors text-sm font-medium"
      >
        <ChevronLeft className="w-4 h-4" />
        返回
      </Link>
      <div className="mx-auto font-bold text-stone-800 tracking-wide">{title}</div>
      <div className="w-16" />
    </header>
  );
};
