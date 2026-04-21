import { createPortal } from "react-dom";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, X, XCircle } from "lucide-react";
import type { NotificationRecord } from "@/lib/notifications";

type NotificationViewportProps = {
  notifications: NotificationRecord[];
  onLock: (id: string) => void;
  onDismiss: (id: string) => void;
};

const LEVEL_STYLES = {
  success: {
    icon: CheckCircle2,
    container:
      "border-emerald-200/80 bg-emerald-50/95 text-emerald-950 shadow-emerald-200/40",
    iconColor: "text-emerald-600",
    detailBullet: "marker:text-emerald-500",
  },
  warning: {
    icon: AlertTriangle,
    container:
      "border-amber-200/80 bg-amber-50/95 text-amber-950 shadow-amber-200/40",
    iconColor: "text-amber-600",
    detailBullet: "marker:text-amber-500",
  },
  error: {
    icon: XCircle,
    container: "border-rose-200/80 bg-rose-50/95 text-rose-950 shadow-rose-200/40",
    iconColor: "text-rose-600",
    detailBullet: "marker:text-rose-500",
  },
} as const;

export const NotificationViewport = ({
  notifications,
  onLock,
  onDismiss,
}: NotificationViewportProps) => {
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed right-4 bottom-4 z-[120] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3 sm:right-6 sm:bottom-6">
      {notifications.map((notification) => {
        const styles = LEVEL_STYLES[notification.level];
        const Icon = styles.icon;

        return (
          <section
            key={notification.id}
            data-testid="notification-card"
            className={clsx(
              "pointer-events-auto origin-bottom-right rounded-2xl border p-4 shadow-lg backdrop-blur will-change-transform",
              styles.container,
            )}
            style={{
              animation: notification.closing
                ? "notification-pop-out 220ms cubic-bezier(0.65, 0, 0.35, 1) forwards"
                : "notification-pop-in 320ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
            onMouseEnter={() => {
              onLock(notification.id);
            }}
            onMouseDown={() => {
              onLock(notification.id);
            }}
            onMouseUp={() => {
              const selection = window.getSelection();

              if (selection?.toString()) {
                onLock(notification.id);
              }
            }}
            onClick={(event) => {
              const target = event.target;

              if (target instanceof Element && target.closest("a,button")) {
                onLock(notification.id);
              }
            }}
          >
            <div className="flex items-start gap-3">
              <Icon className={clsx("mt-0.5 h-5 w-5 shrink-0", styles.iconColor)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p data-testid="notification-title" className="font-medium leading-6">
                    {notification.title}
                  </p>
                  <button
                    type="button"
                    aria-label="关闭提示"
                    className="rounded-full p-1 text-current/70 transition hover:bg-black/5 hover:text-current"
                    onClick={() => {
                      onDismiss(notification.id);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {notification.description ? (
                  <p className="mt-1 text-sm leading-6 text-current/80">
                    {notification.description}
                  </p>
                ) : null}
                {notification.details && notification.details.length > 0 ? (
                  <ul
                    className={clsx(
                      "mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-current/85",
                      styles.detailBullet,
                    )}
                  >
                    {notification.details.map((detail, index) => (
                      <li key={`${notification.id}-detail-${index}`}>{detail}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </section>
        );
      })}
    </div>,
    document.body,
  );
};
