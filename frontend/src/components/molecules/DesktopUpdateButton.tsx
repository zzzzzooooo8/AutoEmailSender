import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useNotification } from "@/context/NotificationContext";
import { useConfirmDialog } from "@/lib/useConfirmDialog";
import {
  checkForDesktopUpdate,
  downloadDesktopUpdate,
  getDesktopAppVersion,
  isDesktopApp,
  onDesktopUpdateStatus,
  quitAndInstallDesktopUpdate,
} from "@/lib/desktopApi";
import type { DesktopUpdateStatus } from "@/types/desktop";

const PENDING_UPDATE_KEY = "desktop_pending_update_version";

const readPendingVersion = (): string | null => {
  const value = window.localStorage.getItem(PENDING_UPDATE_KEY);
  return value && value.trim() ? value.trim() : null;
};

const writePendingVersion = (version: string | null) => {
  if (version) {
    window.localStorage.setItem(PENDING_UPDATE_KEY, version);
    return;
  }
  window.localStorage.removeItem(PENDING_UPDATE_KEY);
};

export function DesktopUpdateButton() {
  if (!isDesktopApp()) {
    return null;
  }

  return <DesktopUpdateButtonInner />;
}

function DesktopUpdateButtonInner() {
  const [version, setVersion] = useState<string>("加载中");
  const [pendingVersion, setPendingVersion] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readPendingVersion(),
  );
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const manualCheckRef = useRef(false);
  const promptingVersionRef = useRef<string | null>(null);
  const { notifyError, notifySuccess } = useNotification();
  const { confirm, dialog } = useConfirmDialog();

  const offerUpdate = useCallback(
    async (nextVersion: string) => {
      if (promptingVersionRef.current === nextVersion) {
        return;
      }

      promptingVersionRef.current = nextVersion;
      try {
        const shouldUpdate = await confirm({
          title: "发现新版本",
          description: `当前版本 v${version}，发现新版本 v${nextVersion}。是否立即下载并安装？`,
          confirmLabel: "下载并安装",
          cancelLabel: "暂不更新",
          tone: "neutral",
        });

        if (!shouldUpdate) {
          return;
        }

        setDownloading(true);
        try {
          const downloadStatus = await downloadDesktopUpdate();
          if (downloadStatus.state === "downloaded") {
            setPendingVersion(downloadStatus.nextVersion);
            writePendingVersion(downloadStatus.nextVersion);
            await quitAndInstallDesktopUpdate();
            return;
          }

          if (downloadStatus.state === "error") {
            notifyError("更新下载失败", downloadStatus.message);
          }
        } catch (downloadError) {
          const message = downloadError instanceof Error ? downloadError.message : "下载更新失败";
          notifyError("更新下载失败", message);
        } finally {
          setDownloading(false);
        }
      } finally {
        promptingVersionRef.current = null;
      }
    },
    [confirm, notifyError, version],
  );

  const handleStatus = useCallback(
    (status: DesktopUpdateStatus) => {
      if (status.state === "checking") {
        setChecking(true);
        return;
      }

      if (status.state === "available") {
        setChecking(false);
        setPendingVersion(status.nextVersion);
        writePendingVersion(status.nextVersion);
        void offerUpdate(status.nextVersion);
        return;
      }

      if (status.state === "not_available") {
        setChecking(false);
        setDownloading(false);
        if (pendingVersion !== null && pendingVersion === version) {
          writePendingVersion(null);
          setPendingVersion(null);
          return;
        }
        notifySuccess("检查更新", "当前已是最新版本。");
        return;
      }

      if (status.state === "downloading") {
        setChecking(false);
        setDownloading(true);
        return;
      }

      if (status.state === "downloaded") {
        setChecking(false);
        setDownloading(false);
        setPendingVersion(status.nextVersion);
        writePendingVersion(status.nextVersion);
        return;
      }

      if (status.state === "error") {
        setChecking(false);
        setDownloading(false);
        notifyError("检查更新失败", status.message);
      }
    },
    [notifyError, notifySuccess, offerUpdate, pendingVersion, version],
  );

  useEffect(() => {
    let cancelled = false;
    void getDesktopAppVersion()
      .then((appVersion) => {
        if (cancelled) {
          return;
        }

        setVersion(appVersion);
        const storedPendingVersion = readPendingVersion();
        if (storedPendingVersion === appVersion) {
          writePendingVersion(null);
          setPendingVersion(null);
          return;
        }

        setPendingVersion(storedPendingVersion);
      })
      .catch(() => {
        if (!cancelled) {
          setVersion("未知");
        }
      });

    const unsubscribe = onDesktopUpdateStatus((status) => {
      if (manualCheckRef.current) {
        if (status.state === "checking") {
          setChecking(true);
        }
        if (status.state === "downloading") {
          setChecking(false);
          setDownloading(true);
        }
        return;
      }
      handleStatus(status);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [handleStatus]);

  const hasPendingUpdate = useMemo(
    () => pendingVersion !== null && pendingVersion !== version,
    [pendingVersion, version],
  );

  const handleCheckUpdate = useCallback(async () => {
    if (checking || downloading) {
      return;
    }

    manualCheckRef.current = true;
    setChecking(true);

    try {
      const status = await checkForDesktopUpdate();
      handleStatus(status);
    } catch (checkError) {
      const message = checkError instanceof Error ? checkError.message : "检查更新失败";
      notifyError("检查更新失败", message);
    } finally {
      manualCheckRef.current = false;
      setChecking(false);
    }
  }, [checking, downloading, handleStatus, notifyError]);

  const isBusy = checking || downloading;

  return (
    <>
      {dialog}
      <button
        type="button"
        disabled={isBusy}
        onClick={() => void handleCheckUpdate()}
        className="inline-flex min-h-[2.8rem] min-w-[11rem] items-center gap-2 rounded-2xl border border-stone-200/90 bg-white/92 px-3 py-2 text-left text-stone-700 shadow-sm shadow-stone-200/45 backdrop-blur-sm transition hover:border-stone-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col items-start leading-none">
          <span className="text-[11px] font-medium tracking-[0.03em] text-stone-500">
            v{version}
          </span>
          <span className="mt-1 text-[13px] font-medium text-stone-900">
            检查更新
          </span>
        </span>
        {hasPendingUpdate ? (
          <span className="shrink-0 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-white">
            NEW
          </span>
        ) : null}
        {!hasPendingUpdate && isBusy ? (
          <span className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-medium text-stone-500">
            ...
          </span>
        ) : null}
      </button>
    </>
  );
}
