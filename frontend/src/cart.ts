import type { ModelColour, Pack, ProductModel } from './types';

export type CartLine = { model: ProductModel; colour: ModelColour; pack: Pack; numberOfPacks: number };

export function addPackLine(cart: CartLine[], model: ProductModel, colour: ModelColour, pack: Pack, numberOfPacks: number) {
  const quantity = Math.min(Math.max(1, Math.trunc(numberOfPacks)), pack.stockQuantity);
  if (quantity <= 0) return cart;
  const existing = cart.find(line => line.pack.id === pack.id);
  return existing
    ? cart.map(line => line.pack.id === pack.id ? { ...line, numberOfPacks: Math.min(line.numberOfPacks + quantity, pack.stockQuantity) } : line)
    : [...cart, { model, colour, pack, numberOfPacks: quantity }];
}
