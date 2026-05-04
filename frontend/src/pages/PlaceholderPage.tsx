interface PlaceholderPageProps {
  title: string;
  description: string;
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ title, description }) => {
  return (
    <main className="max-w-6xl mx-auto w-full px-6 py-12">
      <div className="rounded-2xl border border-stone-200 bg-white p-8">
        <h1 className="text-3xl font-bold text-stone-800 mb-3">{title}</h1>
        <p className="text-stone-500">{description}</p>
      </div>
    </main>
  );
};
