export const MAX_VISIBLE_NOTIFICATIONS = 4;

export type NotificationLevel = "success" | "warning" | "error";

export type NotificationDraft = {
  level: NotificationLevel;
  title: string;
  description?: string;
  details?: string[];
};

export type NotificationRecord = NotificationDraft & {
  id: string;
  createdAt: number;
  durationMs: number;
  interactiveLocked: boolean;
  closing: boolean;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const measureTextLength = ({ title, description = "", details = [] }: NotificationDraft): number =>
  `${title}${description}${details.join("")}`.length;

export const calculateNotificationDuration = (draft: NotificationDraft): number => {
  const textLength = measureTextLength(draft);

  switch (draft.level) {
    case "success":
      return clamp(2200 + textLength * 45, 2000, 3000);
    case "warning":
      return clamp(3200 + textLength * 55, 3000, 6000);
    case "error":
      return clamp(5200 + textLength * 65, 5000, 8000);
  }
};

export const createFormErrorNotification = (
  title: string,
  errors: string[],
): NotificationDraft => ({
  level: "error",
  title,
  description: "",
  details: errors.filter((error) => error !== ""),
});

export const createNotificationRecord = (
  draft: NotificationDraft,
  overrides?: Pick<NotificationRecord, "id" | "createdAt">,
): NotificationRecord => ({
  ...draft,
  id: overrides?.id ?? crypto.randomUUID(),
  createdAt: overrides?.createdAt ?? Date.now(),
  durationMs: calculateNotificationDuration(draft),
  interactiveLocked: false,
  closing: false,
});

export const trimNotifications = (notifications: NotificationRecord[]): NotificationRecord[] =>
  notifications.slice(-MAX_VISIBLE_NOTIFICATIONS);
