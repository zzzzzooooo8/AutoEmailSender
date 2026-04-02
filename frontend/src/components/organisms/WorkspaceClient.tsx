import { useState } from 'react';
import { MentorIntelligencePanel } from './MentorIntelligencePanel';
import { ChatInputBar } from './ChatInputBar';
import { WorkspaceHeader } from '../molecules/WorkspaceHeader';
import { ChatBubble } from '../molecules/ChatBubble';
import type { Mentor } from '@/types';

interface Message {
  id: string;
  senderInitials: string;
  variant: 'sent' | 'received';
  timestamp: string;
  content: string;
}

interface WorkspaceClientProps {
  mentor: Mentor;
  initialMessages: Message[];
}

export const WorkspaceClient: React.FC<WorkspaceClientProps> = ({ mentor, initialMessages }) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);

  const handleSendMessage = (content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      senderInitials: 'Me',
      variant: 'sent',
      timestamp: '刚刚',
      content,
    };
    setMessages([...messages, newMessage]);
  };

  return (
    <div className="flex h-[calc(100vh-64px)] bg-background">
      <MentorIntelligencePanel mentor={mentor} />

      <main className="flex-1 flex flex-col relative bg-alt-bg">
        <WorkspaceHeader title={`与 ${mentor.name} 的通信记录`} />

        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
          <div className="max-w-4xl mx-auto flex flex-col">
            {messages.map((msg) => (
              <ChatBubble
                key={msg.id}
                content={msg.content}
                senderInitials={msg.senderInitials}
                timestamp={msg.timestamp}
                variant={msg.variant}
              />
            ))}
          </div>
        </div>

        <ChatInputBar onSend={handleSendMessage} />
      </main>
    </div>
  );
};
