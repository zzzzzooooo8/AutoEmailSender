export type MentorStatus = '未发送' | '已读' | '待审核' | '已回复' | '婉拒';

export interface Mentor {
  id: string;
  name: string;
  title: string;
  university: string;
  school: string;
  research: string[];
  matchScore: number;
  sentCount: number;
  status: MentorStatus;
}

// --- Profile / Identity ---

export interface SmtpConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  useTLS: boolean;
}

export interface ImapConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  useSSL: boolean;
}

export interface ResumeFile {
  name: string;
  size: number;
  url: string;
}

export interface Profile {
  id: string;
  name: string;
  title: string;
  direction: string;
  avatar?: string;
  smtp: SmtpConfig;
  imap?: ImapConfig;
  resumes: ResumeFile[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

// --- Global LLM Config ---

export interface LLMConfig {
  openaiApiKey?: string;
  deepseekApiKey?: string;
  model: 'openai' | 'deepseek';
  updatedAt?: string;
}
