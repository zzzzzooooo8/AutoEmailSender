import { Navigate, useParams } from 'react-router-dom';
import { WorkspaceClient } from '@/components/organisms/WorkspaceClient';
import { MOCK_MENTORS } from '@/data/mockData';

export const WorkspacePage = () => {
  const { id } = useParams<{ id: string }>();

  const mentor = MOCK_MENTORS.find((item) => item.id === id);
  if (!mentor) {
    return <Navigate to="/404" replace />;
  }

  const initialMessages = [
    {
      id: 'm1',
      senderInitials: 'Me',
      variant: 'sent' as const,
      timestamp: '刚刚',
      content: `尊敬的 ${mentor.name}，您好：\n\n我是来自 XX 大学的同学，研究方向与您的团队非常契合，期待有机会进一步交流。`,
    },
  ];

  return <WorkspaceClient mentor={mentor} initialMessages={initialMessages} />;
};
