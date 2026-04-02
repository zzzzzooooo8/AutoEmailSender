import { Link } from 'react-router-dom';

interface NavButtonProps {
  label: string;
  href: string;
  isActive?: boolean;
}

export const NavButton: React.FC<NavButtonProps> = ({ label, href, isActive = false }) => {
  return (
    <Link
      to={href}
      className={`
        px-1 py-4 text-base font-medium transition-colors
        ${isActive ? 'text-red-600 border-b-2 border-red-600' : 'text-gray-500 hover:text-red-600'}
      `}
    >
      {label}
    </Link>
  );
};
