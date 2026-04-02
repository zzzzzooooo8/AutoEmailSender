export const formatTime = (hour: number, minute: number): string => {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const parseTime = (time: string): { hour: number; minute: number } => {
  const [hour, minute] = time.split(':').map(Number);
  return { hour: hour ?? 0, minute: minute ?? 0 };
};

export const formatScheduleDisplay = (
  type: 'immediate' | 'scheduled',
  scheduledTime?: string,
  frequencyMinutes?: number,
): string => {
  if (type === 'immediate') return '立即发送';
  if (!scheduledTime || !frequencyMinutes) return '未配置';
  const { hour, minute } = parseTime(scheduledTime);
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  return `每日 ${timeStr}，每 ${frequencyMinutes} 分钟/封`;
};
