//搜索输入框
import { Search } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({ 
  value, 
  onChange, 
  placeholder = "搜索姓名、学校..." 
}) => {
  return (
    <div className="relative flex items-center">
      <Search className="absolute left-3 w-4 h-4 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-4 py-2 w-48 rounded-full border border-gray-200 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-shadow text-sm"
      />
    </div>
  );
};