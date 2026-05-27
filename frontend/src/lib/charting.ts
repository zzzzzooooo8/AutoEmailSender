export type TooltipPositionOptions = {
  width: number;
  height: number;
  offset?: number;
  viewportPadding?: number;
};

const defaultTooltipOffset = 14;
const defaultTooltipViewportPadding = 12;
const axisPaddingRatio = 1.08;
const axisNiceSteps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

export const resolveFloatingTooltipPosition = (
  clientX: number,
  clientY: number,
  {
    width,
    height,
    offset = defaultTooltipOffset,
    viewportPadding = defaultTooltipViewportPadding,
  }: TooltipPositionOptions,
): { x: number; y: number } => {
  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
  let x = clientX + offset;
  let y = clientY + offset;

  if (viewportWidth > 0 && x + width + viewportPadding > viewportWidth) {
    x = Math.max(viewportPadding, clientX - width - offset);
  }
  if (viewportHeight > 0 && y + height + viewportPadding > viewportHeight) {
    y = Math.max(viewportPadding, clientY - height - offset);
  }

  return { x: Math.round(x), y: Math.round(y) };
};

export const resolveNiceAxisMax = (maxTotal: number): number => {
  if (maxTotal <= 0) {
    return 1;
  }
  const paddedMax = maxTotal * axisPaddingRatio;
  const magnitude = 10 ** Math.floor(Math.log10(paddedMax));
  const normalized = paddedMax / magnitude;
  const step = axisNiceSteps.find((candidate) => normalized <= candidate) ?? 10;
  return Math.max(5, Math.ceil(step * magnitude));
};

export const buildAxisTicks = (axisMax: number, tickCount = 6): number[] =>
  Array.from({ length: tickCount }, (_, index) =>
    Math.round((axisMax / (tickCount - 1)) * (tickCount - 1 - index)),
  );
