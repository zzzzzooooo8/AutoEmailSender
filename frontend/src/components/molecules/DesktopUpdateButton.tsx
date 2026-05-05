import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useNotification } from "@/context/NotificationContext";
import {
  checkForDesktopUpdate,
  downloadDesktopUpdate,
  getDesktopAppVersion,
  installDownloadedDesktopUpdate,
  isDesktopApp,
  onDesktopUpdateStatus,
  switchDesktopUpdateToFullDownload,
} from "@/lib/desktopApi";
import type { DesktopUpdateDownloadMode, DesktopUpdateStatus } from "@/types/desktop";

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

const CONNECTION_ERROR_PATTERNS = [
  "connection error",
  "econnreset",
  "econnrefused",
  "etimedout",
  "enotfound",
  "network offline",
];

function formatUpdateCheckErrorMessage(message: string): string {
  const normalizedMessage = message.toLowerCase();
  if (!CONNECTION_ERROR_PATTERNS.some((pattern) => normalizedMessage.includes(pattern))) {
    return message;
  }
  return `${message}。请检查系统代理是否已开启，或确认当前网络可以访问 GitHub。`;
}

export function DesktopUpdateButton() {
  if (!isDesktopApp()) {
    return null;
  }

  return <DesktopUpdateButtonInner />;
}

function DesktopUpdateButtonInner() {
  const [version, setVersion] = useState<string>("加载中");
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);
  const [pendingVersion, setPendingVersion] = useState<string | null>(() =>
    typeof window === "undefined" ? null : readPendingVersion(),
  );
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { notifyError, notifySuccess } = useNotification();

  const handleStatus = useCallback(
    (status: DesktopUpdateStatus) => {
      setStatus(status);

      if (status.state === "checking") {
        setChecking(true);
        return;
      }

      if (status.state === "available") {
        setChecking(false);
        setPendingVersion(status.nextVersion);
        writePendingVersion(status.nextVersion);
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

      if (status.state === "downloading" || status.state === "slow_download_offered") {
        setChecking(false);
        setDownloading(true);
        return;
      }

      if (status.state === "downloaded_pending_install") {
        setChecking(false);
        setDownloading(false);
        setPendingVersion(status.nextVersion);
        writePendingVersion(status.nextVersion);
        return;
      }

      if (status.state === "installing") {
        setChecking(false);
        setDownloading(false);
        return;
      }

      if (status.state === "error") {
        setChecking(false);
        setDownloading(false);
        notifyError("检查更新失败", formatUpdateCheckErrorMessage(status.message));
      }
    },
    [notifyError, notifySuccess, pendingVersion, version],
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

    const unsubscribe = onDesktopUpdateStatus(handleStatus);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [handleStatus]);

  const hasPendingUpdate = useMemo(
    () => pendingVersion !== null && pendingVersion !== version,
    [pendingVersion, version],
  );

  const startDownload = useCallback(
    async (mode: DesktopUpdateDownloadMode) => {
      if (downloading) {
        return;
      }

      setDownloading(true);
      try {
        const downloadStatus = await downloadDesktopUpdate(mode);
        handleStatus(downloadStatus);
      } catch (downloadError) {
        const message = downloadError instanceof Error ? downloadError.message : "下载更新失败";
        notifyError("更新下载失败", message);
      } finally {
        setDownloading(false);
      }
    },
    [downloading, handleStatus, notifyError],
  );

  const switchToFullDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const downloadStatus = await switchDesktopUpdateToFullDownload();
      handleStatus(downloadStatus);
    } catch (downloadError) {
      const message = downloadError instanceof Error ? downloadError.message : "切换全量下载失败";
      notifyError("切换全量下载失败", message);
    } finally {
      setDownloading(false);
    }
  }, [handleStatus, notifyError]);

  const installUpdate = useCallback(async () => {
    try {
      await installDownloadedDesktopUpdate();
    } catch (installError) {
      const message = installError instanceof Error ? installError.message : "启动安装失败";
      notifyError("启动安装失败", message);
    }
  }, [notifyError]);

  const handleCheckUpdateWithInstall = useCallback(async () => {
    if (checking || downloading) {
      return;
    }

    setChecking(true);

    try {
      const status = await checkForDesktopUpdate();
      handleStatus(status);
      if (status.state === "downloaded_pending_install") {
        await installUpdate();
      }
    } catch (checkError) {
      const message = checkError instanceof Error ? checkError.message : "检查更新失败";
      notifyError("检查更新失败", formatUpdateCheckErrorMessage(message));
    } finally {
      setChecking(false);
    }
  }, [checking, downloading, handleStatus, installUpdate, notifyError]);

  const isBusy = checking || downloading;

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => void handleCheckUpdateWithInstall()}
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
        <DesktopUpdateStatusBar
          status={status}
          onStartDownload={startDownload}
          onSwitchToFullDownload={switchToFullDownload}
          onInstall={installUpdate}
        />
      </span>
    </>
  );
}

function DesktopUpdateStatusBar({
  status,
  onStartDownload,
  onSwitchToFullDownload,
  onInstall,
}: {
  status: DesktopUpdateStatus | null;
  onStartDownload: (mode: DesktopUpdateDownloadMode) => void;
  onSwitchToFullDownload: () => void;
  onInstall: () => void;
}) {
  if (status === null) {
    return null;
  }

  if (status.state === "available") {
    return (
      <span className="inline-flex min-h-[2.8rem] items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600 shadow-sm">
        <span className="font-medium text-stone-800">发现 v{status.nextVersion}</span>
        <span>增量下载：开始后显示实际大小</span>
        <span>全量约 {formatBytes(status.fullDownloadBytes ?? 0)}</span>
        <button
          type="button"
          onClick={() => onStartDownload("differential")}
          className="rounded-lg border border-stone-200 px-2 py-1 text-stone-700 transition hover:border-primary/40 hover:text-primary"
        >
          增量下载
        </button>
        <button
          type="button"
          onClick={() => onStartDownload("full")}
          className="rounded-lg bg-primary px-2 py-1 text-white transition hover:bg-primary/90"
        >
          全量下载
        </button>
      </span>
    );
  }

  if (status.state === "downloading" || status.state === "slow_download_offered") {
    const modeLabel = status.mode === "full" ? "全量包" : "增量包";

    return (
      <span
        className="inline-flex min-w-[18rem] flex-col rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600 shadow-sm"
        aria-label="更新下载进度"
      >
        <span className="font-medium text-stone-800">
          {modeLabel}：总计 {formatBytes(status.totalBytes)}
        </span>
        <span className="h-1.5 overflow-hidden rounded-full bg-stone-100">
          <span className="block h-full bg-primary" style={{ width: `${status.percent}%` }} />
        </span>
        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          <span>{modeLabel}：已下载 {formatBytes(status.transferredBytes)}</span>
          <span>{modeLabel}：剩余 {formatBytes(status.remainingBytes)}</span>
          <span>{formatBytes(status.bytesPerSecond)}/s</span>
          <span>{formatEta(status.remainingSeconds)}</span>
        </span>
        {status.state === "slow_download_offered" ? (
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <span>
              全量约 {formatBytes(status.fullDownloadBytes ?? status.totalBytes)}，已消耗{" "}
              {formatBytes(status.transferredBytes)}
            </span>
            <button
              type="button"
              onClick={onSwitchToFullDownload}
              className="rounded-lg bg-primary px-2 py-1 text-white transition hover:bg-primary/90"
            >
              切换全量下载
            </button>
          </span>
        ) : null}
      </span>
    );
  }

  if (status.state === "downloaded_pending_install") {
    return (
      <span className="inline-flex min-h-[2.8rem] items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        <span>v{status.nextVersion} 已下载，可稍后安装；再次检查更新会直接安装。</span>
        <button
          type="button"
          onClick={onInstall}
          className="rounded-lg bg-emerald-700 px-2 py-1 text-white transition hover:bg-emerald-800"
        >
          立即重启安装
        </button>
      </span>
    );
  }

  return null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatEta(seconds: number | null): string {
  if (seconds === null) {
    return "预计时间未知";
  }
  if (seconds < 60) {
    return `预计 ${seconds} 秒`;
  }
  return `预计 ${Math.ceil(seconds / 60)} 分钟`;
}
