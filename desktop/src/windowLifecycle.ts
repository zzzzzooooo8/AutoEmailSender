type WindowCloseState = {
  isQuitting: boolean;
};

type RestorableWindow = {
  isMinimized: () => boolean;
  restore: () => void;
  show: () => void;
  focus: () => void;
};

export function shouldHideWindowOnClose({ isQuitting }: WindowCloseState): boolean {
  return !isQuitting;
}

export function restoreExistingWindow(window: RestorableWindow): void {
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
}
