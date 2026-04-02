import { useLocation } from 'react-router-dom';
import { NavButton } from '../atoms/NavButton';

export const TopNavigationBar = () => {
  const { pathname } = useLocation();

  const navItems = [
    { label: '首页', href: '/' },
    { label: '发件页', href: '/campaigns' },
    { label: '个人页', href: '/profile' },
    { label: '设置页', href: '/settings' },
  ];

  return (
    <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-red-600 text-white rounded-lg flex items-center justify-center font-bold text-xl">
            C
          </div>
          <span className="text-xl font-bold text-red-600 tracking-wide">保研陶瓷助手</span>
        </div>

        <nav className="flex items-center gap-8 h-full">
          {navItems.map((item) => (
            <NavButton key={item.href} label={item.label} href={item.href} isActive={pathname === item.href} />
          ))}
        </nav>
      </div>
    </header>
  );
};
