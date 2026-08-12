import { describe, expect, it } from 'vitest';
import { addPackLine, type CartLine } from './cart';
import type { ModelColour, Pack, ProductModel } from './types';

const time = '2026-08-12T00:00:00.000Z';
const model = (id: string): ProductModel => ({ id, modelNumber: id, price: '10.00', isActive: true, colours: [], createdAt: time, updatedAt: time, syncStatus: 'synced' });
const colour = (id: string, modelId: string): ModelColour => ({ id, modelId, name: id, isActive: true, packs: [], createdAt: time, updatedAt: time, syncStatus: 'synced' });
const pack = (id: string, colourId: string, sizesPerPack: number): Pack => ({ id, modelColourId: colourId, sizesPerPack, stockQuantity: 10, isActive: true, createdAt: time, updatedAt: time, syncStatus: 'synced' });

describe('cart line identity', () => {
  it('merges only the exact same pack configuration', () => {
    const firstModel = model('model-1'), secondModel = model('model-2'), black = colour('black', firstModel.id), gold = colour('gold', firstModel.id);
    const blackThree = pack('black-3', black.id, 3), blackSix = pack('black-6', black.id, 6), goldThree = pack('gold-3', gold.id, 3), other = pack('other-3', colour('other-colour', secondModel.id).id, 3);
    let cart: CartLine[] = [];
    cart = addPackLine(cart, firstModel, black, blackThree, 1);
    cart = addPackLine(cart, firstModel, black, blackThree, 2);
    cart = addPackLine(cart, firstModel, black, blackSix, 1);
    cart = addPackLine(cart, firstModel, gold, goldThree, 1);
    cart = addPackLine(cart, secondModel, colour('other-colour', secondModel.id), other, 1);
    expect(cart.map(line => [line.pack.id, line.numberOfPacks])).toEqual([['black-3', 3], ['black-6', 1], ['gold-3', 1], ['other-3', 1]]);
  });
});
