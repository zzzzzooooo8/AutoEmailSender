type WindowCloseState = {
  isQuitting: boolean;
};

export function shouldHideWindowOnClose({ isQuitting }: WindowCloseState): boolean {
  return !isQuitting;
}
