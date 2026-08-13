// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmDestructiveAction } from './confirmDestructiveAction';

describe('confirmDestructiveAction', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('stops immediately when the first confirmation is cancelled', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    expect(confirmDestructiveAction('first', 'final')).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('stops when the final confirmation is cancelled', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(confirmDestructiveAction('first', 'final')).toBe(false);
    expect(confirm).toHaveBeenNthCalledWith(1, 'first');
    expect(confirm).toHaveBeenNthCalledWith(2, 'final');
  });

  it('allows the destructive action only after both confirmations', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(confirmDestructiveAction('first', 'final')).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
