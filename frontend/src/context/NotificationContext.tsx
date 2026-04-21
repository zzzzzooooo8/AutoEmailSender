/* eslint-disable react-refresh/only-export-components */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { flushSync } from "react-dom";
import { NotificationViewport } from "@/components/organisms/NotificationViewport";
import {
  createFormErrorNotification,
  createNotificationRecord,
  trimNotifications,
  type NotificationDraft,
  type NotificationRecord,
} from "@/lib/notifications";

type NotificationContextValue = {
  notifications: NotificationRecord[];
  notify: (draft: NotificationDraft) => NotificationRecord;
  notifySuccess: (title: string, description?: string) => NotificationRecord;
  notifyWarning: (title: string, description?: string) => NotificationRecord;
  notifyError: (title: string, description?: string) => NotificationRecord;
  notifyFormErrors: (title: string, details: string[]) => NotificationRecord | null;
  dismissNotification: (id: string) => void;
  lockNotification: (id: string) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

const CLOSE_ANIMATION_MS = 180;

export const NotificationProvider = ({ children }: PropsWithChildren) => {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const nextIdRef = useRef(0);
  const dismissTimersRef = useRef<Map<string, number>>(new Map());

  const clearDismissTimer = useCallback((id: string) => {
    const timeoutId = dismissTimersRef.current.get(id);

    if (timeoutId === undefined) {
      return;
    }

    window.clearTimeout(timeoutId);
    dismissTimersRef.current.delete(id);
  }, []);

  const dismissNotification = useCallback(
    (id: string) => {
      setNotifications((current) =>
        current.map((notification) =>
          notification.id === id ? { ...notification, closing: true } : notification,
        ),
      );

      clearDismissTimer(id);

      const timeoutId = window.setTimeout(() => {
        dismissTimersRef.current.delete(id);
        flushSync(() => {
          setNotifications((current) =>
            current.filter((notification) => notification.id !== id),
          );
        });
      }, CLOSE_ANIMATION_MS);

      dismissTimersRef.current.set(id, timeoutId);
    },
    [clearDismissTimer],
  );

  const lockNotification = useCallback((id: string) => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === id
          ? { ...notification, interactiveLocked: true }
          : notification,
      ),
    );
  }, []);

  const notify = useCallback((draft: NotificationDraft) => {
    const record = createNotificationRecord(draft, {
      id: `notification-${nextIdRef.current}`,
      createdAt: Date.now(),
    });

    nextIdRef.current += 1;

    setNotifications((current) => trimNotifications([...current, record]));

    return record;
  }, []);

  const notifySuccess = useCallback(
    (title: string, description?: string) =>
      notify({
        level: "success",
        title,
        description,
      }),
    [notify],
  );

  const notifyWarning = useCallback(
    (title: string, description?: string) =>
      notify({
        level: "warning",
        title,
        description,
      }),
    [notify],
  );

  const notifyError = useCallback(
    (title: string, description?: string) =>
      notify({
        level: "error",
        title,
        description,
      }),
    [notify],
  );

  const notifyFormErrors = useCallback(
    (title: string, details: string[]) => {
      const draft = createFormErrorNotification(title, details);

      if ((draft.details?.length ?? 0) === 0) {
        return null;
      }

      return notify(draft);
    },
    [notify],
  );

  useEffect(() => {
    const timeoutIds: number[] = [];

    for (const notification of notifications) {
      if (notification.interactiveLocked || notification.closing) {
        continue;
      }

      timeoutIds.push(
        window.setTimeout(() => {
          dismissNotification(notification.id);
        }, Math.max(notification.createdAt + notification.durationMs - Date.now(), 0)),
      );
    }

    return () => {
      timeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
    };
  }, [dismissNotification, notifications]);

  useEffect(() => {
    const dismissTimers = dismissTimersRef.current;

    return () => {
      dismissTimers.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      dismissTimers.clear();
    };
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      notify,
      notifySuccess,
      notifyWarning,
      notifyError,
      notifyFormErrors,
      dismissNotification,
      lockNotification,
    }),
    [
      dismissNotification,
      lockNotification,
      notifications,
      notify,
      notifyError,
      notifyFormErrors,
      notifySuccess,
      notifyWarning,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationViewport
        notifications={notifications}
        onLock={lockNotification}
        onDismiss={dismissNotification}
      />
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextValue => {
  const context = useContext(NotificationContext);

  if (context === null) {
    throw new Error("NotificationContext 未初始化");
  }

  return context;
};
