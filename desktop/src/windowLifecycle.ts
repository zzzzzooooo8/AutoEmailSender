type WindowCloseState = {
  isQuitting: boolean;
};

type WindowCreationState = {
  pendingCreation: Promise<void> | null;
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

export function startWindowCreationOnce(
  state: WindowCreationState,
  createWindow: () => Promise<void>,
): Promise<void> {
  if (state.pendingCreation !== null) {
    return state.pendingCreation;
  }

  state.pendingCreation = createWindow().finally(() => {
    state.pendingCreation = null;
  });
  return state.pendingCreation;
}
