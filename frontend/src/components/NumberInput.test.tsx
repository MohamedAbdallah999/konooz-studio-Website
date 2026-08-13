// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { NumberInput } from './NumberInput';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let container: HTMLDivElement | undefined;

const changeValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
};

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('NumberInput', () => {
  it('allows clearing and replacing a value even when the parent keeps a numeric fallback', () => {
    function QuantityField() {
      const [quantity, setQuantity] = useState(1);
      return <><NumberInput aria-label="Quantity" value={quantity} min="1" step="1" onChange={event => setQuantity(Math.max(1, Number(event.target.value) || 1))}/><output>{quantity}</output></>;
    }

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<QuantityField/>));
    const input = container.querySelector('input')!;

    act(() => input.focus());
    act(() => changeValue(input, ''));
    expect(input.value).toBe('');
    expect(container.querySelector('output')?.textContent).toBe('1');

    act(() => changeValue(input, '12'));
    expect(input.value).toBe('12');
    expect(container.querySelector('output')?.textContent).toBe('12');

    act(() => input.blur());
    expect(input.value).toBe('12');
  });

  it('leaves optional decimal fields empty while they are being edited', () => {
    function DiscountField() {
      const [discount, setDiscount] = useState('0.00');
      return <NumberInput aria-label="Discount" value={discount} min="0" max="100" step="0.01" onChange={event => setDiscount(event.target.value)}/>;
    }

    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<DiscountField/>));
    const input = container.querySelector('input')!;

    act(() => input.focus());
    act(() => changeValue(input, ''));
    expect(input.value).toBe('');
    act(() => changeValue(input, '7.5'));
    expect(input.value).toBe('7.5');
  });
});
