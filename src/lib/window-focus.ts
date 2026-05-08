export function isWindowFocused(): boolean {
  if (typeof document === 'undefined') return false
  try {
    return document.hasFocus()
  } catch {
    return false
  }
}
