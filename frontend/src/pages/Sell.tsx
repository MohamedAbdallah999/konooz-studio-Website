import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Minus, Plus, ShoppingBag, X, Check } from 'lucide-react';
import { db, createSale } from '../db';
import type { Item, Variant, Sale } from '../types';
import { Receipt } from './Receipt';
import { colorSwatch } from '../colorSwatch';
import { AnimatePresence, motion } from 'framer-motion';

type Cart = { item: Item; variant: Variant; quantity: number; price: number };
export function Sell() {
  const [q, setQ] = useState(''),
    [cart, setCart] = useState<Cart[]>([]),
    [receipt, setReceipt] = useState<Sale | null>(null);
  const [customerName, setCustomerName] = useState(''),
    [customerPhone, setCustomerPhone] = useState(''),
    [shopName, setShopName] = useState(''),
    [customerAddress, setCustomerAddress] = useState('');
  const [discount, setDiscount] = useState(0),
    [partialPayment, setPartialPayment] = useState(false),
    [deposit, setDeposit] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const items =
    useLiveQuery(() => db.items.filter((i) => !i.deletedAt).toArray()) ?? [];
  const results = items.filter(
    (i) =>
      i.modelNumber.toLowerCase().includes(q.toLowerCase()) ||
      i.variants.some(
        (v) =>
          v.color.toLowerCase().includes(q.toLowerCase()) ||
          v.size.toLowerCase().includes(q.toLowerCase()),
      ),
  );
  const inCart = (variantId: string) =>
    cart.find((line) => line.variant.id === variantId)?.quantity ?? 0;
  const remaining = (variant: Variant) =>
    Math.max(0, variant.stockQuantity - inCart(variant.id));
  const add = (item: Item, v: Variant) =>
    setCart((c) => {
      const n = c.find((x) => x.variant.id === v.id);
      if ((n?.quantity ?? 0) >= v.stockQuantity) return c;
      return n
        ? c.map((x) =>
            x === n
              ? { ...x, quantity: Math.min(x.quantity + 1, v.stockQuantity) }
              : x,
          )
        : [...c, { item, variant: v, quantity: 1, price: item.price }];
    });
  const subtotal = cart.reduce((s, x) => s + x.quantity * x.price, 0),
    discountAmount = (subtotal * discount) / 100,
    total = Math.round((subtotal - discountAmount) * 100) / 100;
  const complete = async () => {
    setError('');
    if (partialPayment && (deposit < 0 || deposit > total)) {
      setError('Deposit must be between 0 and the receipt total.');
      return;
    }
    setBusy(true);
    try {
      const sale = await createSale(
        cart.map((x) => ({
          variant: x.variant,
          item: x.item,
          quantity: x.quantity,
          price: x.price,
        })),
        {
          customerName,
          customerPhone,
          shopName,
          customerAddress,
          discountPercentage: discount,
          depositAmount: partialPayment ? deposit : undefined,
        },
      );
      sale.items = sale.items.map((l) => ({
        ...l,
        itemVariant: {
          ...cart.find((x) => x.variant.id === l.itemVariantId)!.variant,
          item: cart.find((x) => x.variant.id === l.itemVariantId)!.item,
        },
      }));
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setShopName('');
      setCustomerAddress('');
      setDiscount(0);
      setPartialPayment(false);
      setDeposit(0);
      setReceipt(sale);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not complete the sale.',
      );
    } finally {
      setBusy(false);
    }
  };
  if (receipt)
    return <Receipt sale={receipt} onClose={() => setReceipt(null)} />;
  return (
    <div className='sell-layout'>
      <section>
        <div className='section-head compact'>
          <div>
            <p className='eyebrow'>NEW TRANSACTION</p>
            <h2>Select a dress</h2>
          </div>
        </div>
        <div className='search'>
          <Search />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder='Model or colour…'
          />
        </div>
        <motion.div className='sell-list' layout>
          {results.map((item,index) => (
            <motion.article
              key={item.id}
              layout
              initial={{opacity:0,x:-28}}
              animate={{opacity:1,x:0}}
              transition={{duration:.48,delay:Math.min(index*.045,.28),ease:[.22,1,.36,1]}}
              whileHover={{y:-1}}
            >
              <div className='model-badge'>
                {item.photoUrl ? (
                  <img src={item.photoUrl} alt={`Model ${item.modelNumber}`} />
                ) : (
                  <span>{item.modelNumber.slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div>
                <small>MODEL</small>
                <h3>{item.modelNumber}</h3>
                <strong>{item.price.toLocaleString()} EGP</strong>
              </div>
              <div className='variant-buttons'>
                {item.variants.map((v) => {
                  const left=remaining(v),out=left===0;
                  return (
                    <button key={v.id} onClick={() => add(item, v)} disabled={out} className={out?'out-of-stock':''}>
                      <span>
                        <i
                          className='color-swatch'
                          style={{ backgroundColor: colorSwatch(v.color) }}
                          aria-hidden='true'
                        />
                        {v.size} / {v.color}
                      </span>
                      <small>{out?'Out of stock':`${left} left`}</small>
                      {!out&&<Plus size={16} />}
                    </button>
                  )})}
              </div>
            </motion.article>
          ))}
        </motion.div>
      </section>
      <aside className='basket'>
        <header>
          <ShoppingBag />
          <div>
            <p className='eyebrow'>CURRENT SALE</p>
            <h2>Your basket</h2>
          </div>
          <span>{cart.reduce((s, x) => s + x.quantity, 0)}</span>
        </header>
        {!cart.length ? (
          <div className='basket-empty'>
            <ShoppingBag />
            <p>Select a size and colour to begin the sale.</p>
          </div>
        ) : (
          <motion.div className='basket-lines' layout>
            <AnimatePresence initial={false}>{cart.map((x, n) => (
              <motion.article key={x.variant.id} layout initial={{opacity:0,x:-16}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-10}} transition={{duration:.35,ease:[.22,1,.36,1]}}>
                <div>
                  <b>{x.item.modelNumber}</b>
                  <span>
                    <i
                      className='color-swatch'
                      style={{ backgroundColor: colorSwatch(x.variant.color) }}
                      aria-hidden='true'
                    />
                    {x.variant.size} / {x.variant.color}
                  </span>
                </div>
                <div className='quantity'>
                  <button
                    onClick={() =>
                      setCart((c) =>
                        c.map((z, i) =>
                          i === n
                            ? { ...z, quantity: Math.max(1, z.quantity - 1) }
                            : z,
                        ),
                      )
                    }
                  >
                    <Minus />
                  </button>
                  <input
                    className='quantity-input'
                    type='number'
                    min='1'
                    max={x.variant.stockQuantity}
                    step='1'
                    value={x.quantity}
                    aria-label={'Quantity for '+x.item.modelNumber+', '+x.variant.size+' / '+x.variant.color}
                    onChange={(e) =>
                      setCart((c) =>
                        c.map((z, i) =>
                          i === n
                            ? {
                                ...z,
                                quantity: Math.min(
                                  z.variant.stockQuantity,
                                  Math.max(1, Number(e.target.value) || 1),
                                ),
                              }
                            : z,
                        ),
                      )
                    }
                  />
                  <button
                    onClick={() =>
                      setCart((c) =>
                        c.map((z, i) =>
                          i === n
                            ? {
                                ...z,
                                quantity: Math.min(
                                  z.quantity + 1,
                                  z.variant.stockQuantity,
                                ),
                              }
                            : z,
                        ),
                      )
                    }
                  >
                    <Plus />
                  </button>
                </div>
                <label>
                  <input
                    type='number'
                    min='0'
                    value={x.price}
                    onChange={(e) =>
                      setCart((c) =>
                        c.map((z, i) =>
                          i === n ? { ...z, price: Number(e.target.value) } : z,
                        ),
                      )
                    }
                  />{' '}
                  EGP
                </label>
                <button
                  className='remove'
                  onClick={() => setCart((c) => c.filter((_, i) => i !== n))}
                >
                  <X />
                </button>
              </motion.article>
            ))}</AnimatePresence>
          </motion.div>
        )}
        <div className='checkout-details client-details'>
          <label>
            Client name
            <input
              value={customerName}
              maxLength={120}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder='Optional'
            />
          </label>
          <label>
            Phone number
            <input
              type='tel'
              value={customerPhone}
              maxLength={40}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder='Optional'
            />
          </label>
          <label>
            Shop name
            <input
              value={shopName}
              maxLength={120}
              onChange={(e) => setShopName(e.target.value)}
              placeholder='Optional'
            />
          </label>
          <label>
            Address
            <input
              value={customerAddress}
              maxLength={500}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder='Optional'
            />
          </label>
          <label>
            Discount percentage
            <div className='discount-input'>
              <input
                type='number'
                min='0'
                max='100'
                step='0.5'
                value={discount}
                onChange={(e) =>
                  setDiscount(
                    Math.min(100, Math.max(0, Number(e.target.value))),
                  )
                }
              />
              <span>%</span>
            </div>
          </label>
          <label className='payment-toggle'>
            <input
              type='checkbox'
              checked={partialPayment}
              onChange={(e) => {
                setPartialPayment(e.target.checked);
                setDeposit(0);
              }}
            />{' '}
            Client is paying a deposit
          </label>
          {partialPayment && (
            <label className='wide'>
              Deposit paid now
              <input
                type='number'
                min='0'
                max={total}
                step='0.01'
                value={deposit}
                onChange={(e) => setDeposit(Number(e.target.value))}
              />
              <small>
                Outstanding: {Math.max(0, total - deposit).toLocaleString()} EGP
              </small>
            </label>
          )}
        </div>
        <footer>
          {discount > 0 && (
            <>
              <div className='checkout-row'>
                <span>Subtotal</span>
                <b>{subtotal.toLocaleString()} EGP</b>
              </div>
              <div className='checkout-row discount'>
                <span>Discount ({discount}%)</span>
                <b>− {discountAmount.toLocaleString()} EGP</b>
              </div>
            </>
          )}
          <div>
            <span>Total</span>
            <strong>
              {total.toLocaleString()} <small>EGP</small>
            </strong>
          </div>
          {partialPayment && (
            <div className='checkout-row payment'>
              <span>Paid now</span>
              <b>{deposit.toLocaleString()} EGP</b>
            </div>
          )}
          {error && <p className='error'>{error}</p>}
          <button
            className='primary sale-button'
            disabled={!cart.length || busy}
            onClick={complete}
          >
            <Check /> {busy ? 'Completing…' : 'Complete sale'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
