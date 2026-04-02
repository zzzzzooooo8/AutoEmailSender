import { GraduationCap } from 'lucide-react';
import clsx from 'clsx';
import { Link, useLocation } from 'react-router-dom';

export const TopNavBar = () => {
  const { pathname } = useLocation();

  const navItems = [
    { label: '首页', href: '/' },
    { label: '发件页', href: '/tasks' },
    { label: '个人页', href: '/profile' },
  ];

  return (
    <nav className="h-16 bg-[#fefaf3] border-b border-primary/20 sticky top-0 z-50 shrink-0">
      <div className="max-w-6xl mx-auto h-full px-8 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="bg-primary text-white p-1.5 rounded-md group-hover:bg-primary-dark transition-colors">
            <GraduationCap className="w-5 h-5" />
          </div>
          <span className="text-xl font-bold text-primary group-hover:text-primary-dark transition-colors tracking-wide">
            保研陶瓷助手
          </span>
        </Link>

        <div className="flex items-center gap-8 h-full">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                to={item.href}
                className={clsx(
                  'relative h-full flex items-center text-sm font-medium transition-colors duration-200',
                  isActive ? 'text-primary' : 'text-stone-500 hover:text-stone-800',
                )}
              >
                {item.label}
                {isActive && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full" />}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
