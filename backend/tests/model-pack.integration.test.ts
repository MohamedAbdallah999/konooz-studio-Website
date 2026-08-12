import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { app } from '../src/app.js';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';

const enabled = process.env.RUN_DB_TESTS === '1';
const suite = enabled ? describe : describe.skip;
const auth = () => ({ Authorization: `Bearer ${jwt.sign({}, config.JWT_ACCESS_SECRET, { subject: crypto.randomUUID(), expiresIn: '15m' })}` });
const modelBody = (modelNumber: string, price = '10.01', stockQuantity = 5) => ({
  modelNumber, price, photoUrl: null, material: 'Silk', isActive: true,
  colours: [{ name: 'Black', isActive: true, packs: [{ sizesPerPack: 3, stockQuantity, isActive: true }] }],
});

suite('model → colour → pack API', () => {
  beforeEach(async () => {
    await prisma.saleItem.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.pack.deleteMany();
    await prisma.modelColour.deleteMany();
    await prisma.productModel.deleteMany();
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('requires authentication and performs nested CRUD with optimistic concurrency', async () => {
    await request(app).get('/api/models').expect(401);
    const created = await request(app).post('/api/models').set(auth()).send(modelBody('M123')).expect(201);
    expect(created.body.price).toBe('10.01');
    expect(created.body.colours[0].packs[0].sizesPerPack).toBe(3);
    const read = await request(app).get(`/api/models/${created.body.id}`).set(auth()).expect(200);
    const colour = read.body.colours[0], pack = colour.packs[0];
    const update = {
      ...modelBody('M124', '12.34'), expectedUpdatedAt: read.body.updatedAt,
      colours: [
        { id: colour.id, expectedUpdatedAt: colour.updatedAt, name: 'Midnight', isActive: true, packs: [
          { id: pack.id, expectedUpdatedAt: pack.updatedAt, sizesPerPack: 4, stockQuantity: 7, isActive: true },
          { sizesPerPack: 6, stockQuantity: 2, isActive: true },
        ] },
        { name: 'Gold', isActive: true, packs: [{ sizesPerPack: 2, stockQuantity: 3, isActive: true }] },
      ],
    };
    const updated = await request(app).put(`/api/models/${created.body.id}`).set(auth()).send(update).expect(200);
    expect(updated.body).toMatchObject({ modelNumber: 'M124', price: '12.34' });
    expect(updated.body.colours).toHaveLength(2);
    expect(updated.body.colours.find((entry: { name: string }) => entry.name === 'Midnight').packs).toHaveLength(2);
    await request(app).put(`/api/models/${created.body.id}`).set(auth()).send(update).expect(409);
    await request(app).post('/api/models').set(auth()).send(modelBody('m124')).expect(409);
    await request(app).delete(`/api/models/${created.body.id}`).set(auth()).expect(204);
    await request(app).get(`/api/models/${created.body.id}`).set(auth()).expect(404);
  });

  it('rejects cross-model/colour packs and any submitted price fields', async () => {
    const first = (await request(app).post('/api/models').set(auth()).send(modelBody('A')).expect(201)).body;
    const second = (await request(app).post('/api/models').set(auth()).send(modelBody('B')).expect(201)).body;
    await request(app).post('/api/sales').set(auth()).send({ discountPercentage: '0', items: [{ modelId: first.id, colourId: first.colours[0].id, packId: second.colours[0].packs[0].id, numberOfPacks: 1 }] }).expect(409);
    await request(app).post('/api/sales').set(auth()).send({ discountPercentage: '0', items: [{ modelId: first.id, colourId: first.colours[0].id, packId: first.colours[0].packs[0].id, numberOfPacks: 1, price: '0.01', total: '0.01' }] }).expect(422);
    for (const numberOfPacks of [0, -1, 1.5, 1001]) {
      await request(app).post('/api/sales').set(auth()).send({ items: [{ modelId: first.id, colourId: first.colours[0].id, packId: first.colours[0].packs[0].id, numberOfPacks }] }).expect(422);
    }
  });

  it('calculates Decimal totals, preserves snapshots, and restores pack stock on refund', async () => {
    const created = (await request(app).post('/api/models').set(auth()).send(modelBody('DECIMAL', '10.01', 5)).expect(201)).body;
    const colour = created.colours[0], pack = colour.packs[0];
    const sold = (await request(app).post('/api/sales').set(auth()).send({ discountPercentage: '12.50', depositAmount: '10.00', items: [{ modelId: created.id, colourId: colour.id, packId: pack.id, numberOfPacks: 2 }] }).expect(201)).body;
    expect(sold.totalAmount).toBe('52.55');
    expect(sold.items[0]).toMatchObject({ modelNumberAtSale: 'DECIMAL', modelPriceAtSale: '10.01', colourNameAtSale: 'Black', sizesPerPackAtSale: 3, packPriceAtSale: '30.03', numberOfPacks: 2, lineSubtotal: '60.06', discountAllocation: '7.51', finalLineTotal: '52.55' });
    expect((await prisma.pack.findUniqueOrThrow({ where: { id: pack.id } })).stockQuantity).toBe(3);

    const current = await prisma.productModel.findUniqueOrThrow({ where: { id: created.id }, include: { colours: { include: { packs: true } } } });
    await prisma.productModel.update({ where: { id: current.id }, data: { modelNumber: 'CHANGED', price: new Prisma.Decimal('99.99') } });
    await prisma.modelColour.update({ where: { id: colour.id }, data: { name: 'Changed colour' } });
    await prisma.pack.update({ where: { id: pack.id }, data: { sizesPerPack: 9 } });
    const history = (await request(app).get(`/api/sales/${sold.id}`).set(auth()).expect(200)).body;
    expect(history.items[0]).toMatchObject({ modelNumberAtSale: 'DECIMAL', modelPriceAtSale: '10.01', colourNameAtSale: 'Black', sizesPerPackAtSale: 3, packPriceAtSale: '30.03' });
    await request(app).delete(`/api/sales/${sold.id}`).set(auth()).expect(204);
    expect((await prisma.pack.findUniqueOrThrow({ where: { id: pack.id } })).stockQuantity).toBe(5);
    const refundedHistory = (await request(app).get(`/api/sales/${sold.id}`).set(auth()).expect(200)).body;
    expect(refundedHistory.deletedAt).toBeTruthy();
    expect(refundedHistory.items[0]).toMatchObject({ modelNumberAtSale: 'DECIMAL', colourNameAtSale: 'Black', sizesPerPackAtSale: 3 });
  });

  it('allows only one of two concurrent checkouts to reserve the final pack', async () => {
    const created = (await request(app).post('/api/models').set(auth()).send(modelBody('RACE', '5.00', 1)).expect(201)).body;
    const line = { modelId: created.id, colourId: created.colours[0].id, packId: created.colours[0].packs[0].id, numberOfPacks: 1 };
    const responses = await Promise.all([request(app).post('/api/sales').set(auth()).send({ items: [line] }), request(app).post('/api/sales').set(auth()).send({ items: [line] })]);
    expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
    expect((await prisma.pack.findUniqueOrThrow({ where: { id: line.packId } })).stockQuantity).toBe(0);
  });

  it('enforces database constraints for price, pack size and stock', async () => {
    await expect(prisma.$executeRawUnsafe(`INSERT INTO models(id,model_number,price,updated_at) VALUES (gen_random_uuid(),'BAD',-1,CURRENT_TIMESTAMP)`)).rejects.toThrow();
    const created = (await request(app).post('/api/models').set(auth()).send(modelBody('CONSTRAINT')).expect(201)).body;
    await expect(prisma.$executeRawUnsafe(`UPDATE packs SET sizes_per_pack=0 WHERE id='${created.colours[0].packs[0].id}'::uuid`)).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(`UPDATE packs SET stock_quantity=-1 WHERE id='${created.colours[0].packs[0].id}'::uuid`)).rejects.toThrow();
  });
});
