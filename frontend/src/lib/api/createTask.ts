import type { CreateTaskPayload } from '@/features/create-task/types';

export const createTask = async (payload: CreateTaskPayload): Promise<{ id: string }> => {
  // TODO: 替换为真实后端 API
  await new Promise((resolve) => setTimeout(resolve, 800));
  console.log('[API] 创建任务:', payload);
  return { id: `task-${Date.now()}` };
};
