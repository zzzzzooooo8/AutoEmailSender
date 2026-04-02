import { MentorDashboardClient } from '@/components/organisms/MentorDashboardClient';
import { MOCK_MENTORS } from '@/data/mockData';

export const HomePage = () => {
  return (
    <main className="max-w-6xl mx-auto px-6 mt-8 pb-10 w-full">
      <MentorDashboardClient initialMentors={MOCK_MENTORS} />
    </main>
  );
};
