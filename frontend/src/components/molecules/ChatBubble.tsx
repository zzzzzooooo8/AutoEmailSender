// components/molecules/ChatBubble.tsx核心组件 - SMS 风邮件气泡
import clsx from 'clsx';
import { Avatar } from '../atoms/Avatar';
import ReactMarkdown from 'react-markdown'; // 💡 建议安装此库处理 Markdown：pnpm add react-markdown

interface ChatBubbleProps {
  content: string;         // 邮件正文 (Markdown 格式)
  senderInitials: string;
  timestamp: string;      // 例如 "3天前 10:00" 或 "14:30"
  variant: 'received' | 'sent'; // 'received' 是教授，'sent' 是学生
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ content, senderInitials, timestamp, variant }) => {
  const isSent = variant === 'sent';

  return (
    <div className={clsx("flex items-start gap-4 mb-8", isSent && "flex-row-reverse")}>
      
      {/* 头像 - 服务端渲染 */}
      <Avatar initials={senderInitials} variant={isSent ? 'student' : 'mentor'} size="sm" />
      
      {/* 气泡与时间容器 */}
      <div className={clsx("flex flex-col gap-1.5", isSent ? "items-end" : "items-start")}>
        <span className="text-xs text-stone-400 select-none">
          {timestamp}
        </span>
        
        {/* 💡 💡 💡 核心：SMS 风气泡设计 💡 💡 💡 */}
        <div className={clsx(
          "px-6 py-4 rounded-3xl max-w-2xl border border-solid",
          /* 💡 不同状态的气泡形状与颜色处理 (SMS 风格) */
          isSent 
            ? "bg-primary text-white border-primary rounded-br-lg rounded-tr-3xl rounded-l-3xl shadow-md"  // 学生发送：红砖色，靠右，右下角尖锐
            : "bg-white text-stone-800 border-stone-200 rounded-bl-lg rounded-tl-3xl rounded-r-3xl shadow-sm" // 导师回复：象牙白，靠左，左下角尖锐
        )}>
          {/* 💡 💡 Markdown 排版：专门为长邮件正文优化的排版策略 */}
          <article className={clsx(
            "prose prose-sm leading-relaxed whitespace-pre-wrap font-serif break-words",
            /* 💡 自定义 Markdown 元素颜色以匹配气泡底色 */
            isSent 
              ? "prose-headings:text-white prose-p:text-white prose-strong:text-white prose-a:text-white/80" 
              : "prose-headings:text-primary-dark prose-p:text-stone-800 prose-strong:text-stone-900 prose-a:text-primary"
          )}>
            <ReactMarkdown>{content}</ReactMarkdown>
          </article>
        </div>
      </div>
    </div>
  );
};