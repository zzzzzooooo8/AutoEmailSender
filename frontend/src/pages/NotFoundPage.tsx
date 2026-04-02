import { Link } from 'react-router-dom';

export const NotFoundPage = () => {
  return (
    <main className="max-w-6xl mx-auto w-full px-6 py-12">
      <div className="rounded-2xl border border-stone-200 bg-white p-8">
        <h1 className="text-3xl font-bold text-stone-800 mb-3">页面不存在</h1>
        <p className="text-stone-500 mb-6">你访问的链接不存在或已被移动。</p>
        <Link
          to="/"
          className="inline-flex items-center px-4 py-2 rounded-lg bg-primary text-white font-medium hover:bg-primary-dark transition-colors"
        >
          返回首页
        </Link>
      </div>
    </main>
  );
};
