import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { app } from '../src/app.js';
import { config, jwtIdentity } from '../src/config.js';
import { prisma } from '../src/db.js';

const enabled = process.env.RUN_DB_TESTS === '1';
const suite = enabled ? describe : describe.skip;
const auth = () => ({ Authorization: `Bearer ${jwt.sign({ tokenUse: 'access' }, config.JWT_ACCESS_SECRET, { ...jwtIdentity, algorithm: 'HS256', subject: crypto.randomUUID(), expiresIn: '15m' })}` });
const modelBody = (modelNumber: string, price = '10.01', stockQuantity = 5) => ({
  modelNumber, price, photoUrl: null, material: 'Silk', isActive: true,
  colours: [{ name: 'Black', isActive: true, packs: [{ sizesPerPack: 3, stockQuantity, isActive: true }] }],
});

suite('model → colour → pack API', () => {
  beforeEach(async () => {
    await prisma.loginRateLimit.deleteMany();
    await prisma.saleItem.deleteMany();
    await prisma.sale.deleteMany();
    await prisma.pack.deleteMany();
    await prisma.modelColour.deleteMany();
    await prisma.productModel.deleteMany();
  });
  afterAll(async () => { await prisma.$disconnect(); });

  it('requires authentication and performs nested CRUD with optimistic concurrency', async () => {
    await request(app).get('/api/models').expect(401);
    await request(app).get('/api/models').set('Authorization', `Bearer ${jwt.sign({ tokenUse: 'refresh' }, config.JWT_ACCESS_SECRET, { ...jwtIdentity, algorithm: 'HS256', subject: crypto.randomUUID() })}`).expect(401);
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

  it('validates stored image content on the server', async () => {
    await request(app).post('/api/models').set(auth()).send({ ...modelBody('BAD-IMAGE'), photoUrl: 'data:image/png;base64,QUFBQQ==' }).expect(422);
    await request(app).post('/api/models').set(auth()).send({ ...modelBody('INSECURE-IMAGE'), photoUrl: 'http://example.com/photo.png' }).expect(422);
  });

  it('calculates Decimal totals, preserves snapshots, and restores pack stock on refund', async () => {
    const created = (await request(app).post('/api/models').set(auth()).send(modelBody('DECIMAL', '10.01', 5)).expect(201)).body;
    const colour = created.colours[0], pack = colour.packs[0];
    const sold = (await request(app).post('/api/sales').set(auth()).send({ discountPercentage: '12.50', depositAmount: '10.00', items: [{ modelId: created.id, colourId: colour.id, packId: pack.id, numberOfPacks: 2 }] }).expect(201)).body;
    expect(sold.totalAmount).toBe('52.55');
    expect(sold.items[0]).toMatchObject({ modelNumberAtSale: 'DECIMAL', modelPriceAtSale: '10.01', colourNameAtSale: 'Black', sizesPerPackAtSale: 3, packPriceAtSale: '30.03', numberOfPacks: 2, lineSubtotal: '60.06', discountAllocation: '0.00', finalLineTotal: '60.06' });
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

  it('completes a discounted sale across multiple models and multiple colours', async () => {
    const first = (await request(app).post('/api/models').set(auth()).send({
      ...modelBody('MULTI-A', '10.01', 5),
      colours: [
        { name: 'Black', isActive: true, packs: [{ sizesPerPack: 3, stockQuantity: 5, isActive: true }] },
        { name: 'Gold', isActive: true, packs: [{ sizesPerPack: 2, stockQuantity: 5, isActive: true }] },
      ],
    }).expect(201)).body;
    const second = (await request(app).post('/api/models').set(auth()).send(modelBody('MULTI-B', '5.55', 5)).expect(201)).body;
    const sold = (await request(app).post('/api/sales').set(auth()).send({
      discountPercentage: '7.50',
      items: [
        { modelId: first.id, colourId: first.colours[0].id, packId: first.colours[0].packs[0].id, numberOfPacks: 2 },
        { modelId: first.id, colourId: first.colours[1].id, packId: first.colours[1].packs[0].id, numberOfPacks: 1 },
        { modelId: second.id, colourId: second.colours[0].id, packId: second.colours[0].packs[0].id, numberOfPacks: 3 },
      ],
    }).expect(201)).body;
    expect(sold.items.map((line: { lineSubtotal: string }) => line.lineSubtotal)).toEqual(['60.06', '20.02', '49.95']);
    expect(new Set(sold.items.map((line: { modelIdAtSale: string }) => line.modelIdAtSale)).size).toBe(2);
    expect(new Set(sold.items.map((line: { colourIdAtSale: string }) => line.colourIdAtSale)).size).toBe(3);
    expect(sold.items.every((line: { lineSubtotal: string; discountAllocation: string; finalLineTotal: string }) => new Prisma.Decimal(line.discountAllocation).eq(0) && new Prisma.Decimal(line.lineSubtotal).eq(line.finalLineTotal))).toBe(true);
    expect(sold.totalAmount).toBe('120.28');
    expect((await prisma.pack.findUniqueOrThrow({ where: { id: first.colours[0].packs[0].id } })).stockQuantity).toBe(3);
    expect((await prisma.pack.findUniqueOrThrow({ where: { id: first.colours[1].packs[0].id } })).stockQuantity).toBe(4);
    expect((await prisma.pack.findUniqueOrThrow({ where: { id: second.colours[0].packs[0].id } })).stockQuantity).toBe(2);
  });

  it('enforces exact CORS origins and database-backed login throttling', async () => {
    const username = 'security-admin';
    await prisma.adminUser.upsert({ where: { username }, update: {}, create: { username, passwordHash: await bcrypt.hash('correct-password-123', 12) } });
    await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send({ username, password: 'correct-password-123' }).expect(403);
    const successful = await request(app).post('/api/auth/login').set('Origin', config.FRONTEND_ORIGIN).send({ username, password: 'correct-password-123' }).expect(200);
    expect(successful.body.accessToken).toEqual(expect.any(String));
    expect(successful.headers['set-cookie']?.[0]).toContain('HttpOnly');
    const originalCookie = successful.headers['set-cookie']![0]!.split(';')[0]!;
    const refreshed = await request(app).post('/api/auth/refresh').set('Origin', config.FRONTEND_ORIGIN).set('Cookie', originalCookie).expect(200);
    const rotatedCookie = refreshed.headers['set-cookie']![0]!.split(';')[0]!;
    expect(rotatedCookie).not.toBe(originalCookie);
    await request(app).post('/api/auth/refresh').set('Origin', config.FRONTEND_ORIGIN).set('Cookie', originalCookie).expect(401);
    await request(app).post('/api/auth/refresh').set('Origin', config.FRONTEND_ORIGIN).set('Cookie', rotatedCookie).expect(200);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await request(app).post('/api/auth/login').set('Origin', config.FRONTEND_ORIGIN).send({ username, password: 'wrong-password' }).expect(401);
    }
    const blocked = await request(app).post('/api/auth/login').set('Origin', config.FRONTEND_ORIGIN).send({ username, password: 'wrong-password' }).expect(429);
    expect(blocked.headers['retry-after']).toBeTruthy();
  });

  it('handles zero, maximum, and invalid percentage discounts', async () => {
    const zeroModel = (await request(app).post('/api/models').set(auth()).send(modelBody('ZERO-DISCOUNT', '0.01', 5)).expect(201)).body;
    const zeroPack = zeroModel.colours[0].packs[0];
    const zero = (await request(app).post('/api/sales').set(auth()).send({ discountPercentage: '0', items: [{ modelId: zeroModel.id, colourId: zeroModel.colours[0].id, packId: zeroPack.id, numberOfPacks: 2 }] }).expect(201)).body;
    expect(zero.items[0]).toMatchObject({ lineSubtotal: '0.06', finalLineTotal: '0.06' });
    expect(new Prisma.Decimal(zero.items[0].discountAllocation).eq(0)).toBe(true);

    const maxModel = (await request(app).post('/api/models').set(auth()).send(modelBody('MAX-DISCOUNT', '0.01', 5)).expect(201)).body;
    const maxPack = maxModel.colours[0].packs[0];
    const maximum = (await request(app).post('/api/sales').set(auth()).send({ discountPercentage: '100.00', items: [{ modelId: maxModel.id, colourId: maxModel.colours[0].id, packId: maxPack.id, numberOfPacks: 2 }] }).expect(201)).body;
    expect(maximum.items[0]).toMatchObject({ lineSubtotal: '0.06', discountAllocation: '0.00', finalLineTotal: '0.06' });
    expect(new Prisma.Decimal(maximum.totalAmount).eq(0)).toBe(true);
    for (const discountPercentage of ['100.01', '-1', 'not-a-number']) {
      await request(app).post('/api/sales').set(auth()).send({ discountPercentage, items: [{ modelId: maxModel.id, colourId: maxModel.colours[0].id, packId: maxPack.id, numberOfPacks: 1 }] }).expect(422);
    }
  });

  it('enforces database constraints for price, pack size and stock', async () => {
    await expect(prisma.$executeRawUnsafe(`INSERT INTO models(id,model_number,price,updated_at) VALUES (gen_random_uuid(),'BAD',-1,CURRENT_TIMESTAMP)`)).rejects.toThrow();
    const created = (await request(app).post('/api/models').set(auth()).send(modelBody('CONSTRAINT')).expect(201)).body;
    await expect(prisma.$executeRawUnsafe(`UPDATE packs SET sizes_per_pack=0 WHERE id='${created.colours[0].packs[0].id}'::uuid`)).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(`UPDATE packs SET stock_quantity=-1 WHERE id='${created.colours[0].packs[0].id}'::uuid`)).rejects.toThrow();
  });
});
