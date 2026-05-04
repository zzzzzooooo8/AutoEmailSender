import { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, RotateCcw } from "lucide-react";
import {
  checkForDesktopUpdate,
  downloadDesktopUpdate,
  getDesktopAppVersion,
  isDesktopApp,
  onDesktopUpdateStatus,
  quitAndInstallDesktopUpdate,
} from "@/lib/desktopApi";
import type { DesktopUpdateStatus } from "@/types/desktop";

export function DesktopUpdateCard() {
  const [version, setVersion] = useState<string>("加载中");
  const [status, setStatus] = useState<DesktopUpdateStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isDesktopApp()) {
      return;
    }
    void getDesktopAppVersion()
      .then(setVersion)
      .catch(() => setVersion("未知"));
    return onDesktopUpdateStatus(setStatus);
  }, []);

  if (!isDesktopApp()) {
    return null;
  }

  const statusText = formatStatus(status);

  return (
    <section className="min-w-0 rounded-2xl border border-stone-200 bg-white px-6 py-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-stone-900">桌面应用更新</h2>
            <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-600">
              v{version}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-stone-600">{statusText}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => runAction(setBusy, () => checkForDesktopUpdate().then(setStatus))}
            className="ui-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            检查更新
          </button>
          {status?.state === "available" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction(setBusy, () => downloadDesktopUpdate().then(setStatus))}
              className="ui-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              下载更新
            </button>
          ) : null}
          {status?.state === "downloaded" ? (
            <button
              type="button"
              onClick={() => void quitAndInstallDesktopUpdate()}
              className="ui-btn-primary"
            >
              <RotateCcw className="h-4 w-4" />
              重启并安装
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function formatStatus(status: DesktopUpdateStatus | null): string {
  if (!status) {
    return "可手动检查是否有新版本。";
  }
  if (status.state === "checking") {
    return "正在检查更新...";
  }
  if (status.state === "available") {
    return `发现新版本 v${status.nextVersion}。`;
  }
  if (status.state === "not_available") {
    return "当前已是最新版本。";
  }
  if (status.state === "downloading") {
    return `正在下载更新：${status.percent}%`;
  }
  if (status.state === "downloaded") {
    return `新版本 v${status.nextVersion} 已下载，重启后安装。`;
  }
  if (status.state === "error") {
    return `更新失败：${status.message}`;
  }
  return "可手动检查是否有新版本。";
}

async function runAction(setBusy: (busy: boolean) => void, action: () => Promise<void>) {
  setBusy(true);
  try {
    await action();
  } finally {
    setBusy(false);
  }
}
