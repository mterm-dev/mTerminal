const MOUSE_TRACKING_MODES = new Set([
  9, 1000, 1001, 1002, 1003, 1005, 1006, 1015, 1016,
]);

export function isMouseTrackingDecset(params: (number | number[])[]): boolean {
  if (params.length === 0) return false;
  for (const p of params) {
    if (typeof p !== "number" || !MOUSE_TRACKING_MODES.has(p)) return false;
  }
  return true;
}
