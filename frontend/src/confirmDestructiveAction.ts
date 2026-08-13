export function confirmDestructiveAction(firstMessage: string, finalMessage: string) {
  if (!window.confirm(firstMessage)) return false;
  return window.confirm(finalMessage);
}
