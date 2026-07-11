import {describe,it,expect} from 'vitest';import bcrypt from 'bcryptjs';
describe('admin credentials',()=>{it('hashes passwords at cost 12',async()=>{const hash=await bcrypt.hash('strong-password',12);expect(await bcrypt.compare('strong-password',hash)).toBe(true);expect(bcrypt.getRounds(hash)).toBe(12);});});
