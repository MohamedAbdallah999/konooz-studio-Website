import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Minus, Plus, ShoppingBag, X, Check } from 'lucide-react';
import { db, createSale } from '../db';
import type { ModelColour, Pack, ProductModel, Sale } from '../types';
import { Receipt } from './Receipt';
import { colorSwatch } from '../colorSwatch';
import { AnimatePresence, motion } from 'framer-motion';
import { AnimatedTitle } from '../components/AnimatedTitle';
import { NumberInput } from '../components/NumberInput';
import { addMoney, compareMoney, discountedMoney, formatMoney, multiplyMoney, normalizeDecimal, subtractMoney } from '../money';
import { addPackLine, cartCounts, type CartLine } from '../cart';

export function Sell() {
  const [q, setQ] = useState(''), [cart, setCart] = useState<CartLine[]>([]), [receipt, setReceipt] = useState<Sale | null>(null);
  const [selectedModelId, setSelectedModelId] = useState(''), [selectedColourId, setSelectedColourId] = useState(''), [selectedPackId, setSelectedPackId] = useState(''), [numberOfPacks, setNumberOfPacks] = useState(1);
  const [customerName, setCustomerName] = useState(''), [customerPhone, setCustomerPhone] = useState(''), [shopName, setShopName] = useState(''), [customerAddress, setCustomerAddress] = useState('');
  const [discount, setDiscount] = useState('0'), [partialPayment, setPartialPayment] = useState(false), [deposit, setDeposit] = useState('0.00'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const models = useLiveQuery(() => db.models.filter(model => model.isActive).toArray()) ?? [];
  const results = models.filter(model => model.modelNumber.toLowerCase().includes(q.toLowerCase()) || model.colours.some(colour => colour.name.toLowerCase().includes(q.toLowerCase())));
  const selectedModel = models.find(model => model.id === selectedModelId);
  const selectedColour = selectedModel?.colours.find(colour => colour.id === selectedColourId && colour.isActive);
  const selectedPack = selectedColour?.packs.find(pack => pack.id === selectedPackId && pack.isActive);
  const inCart = (packId: string) => cart.find(line => line.pack.id === packId)?.numberOfPacks ?? 0;
  const packsRemaining = (pack: Pack) => Math.max(0, pack.stockQuantity - inCart(pack.id));

  const addSelected = () => {
    if (!selectedModel || !selectedColour || !selectedPack) return;
    const available = packsRemaining(selectedPack);
    const quantity = Math.min(Math.max(1, Math.trunc(numberOfPacks)), available);
    if (quantity <= 0) return;
    setCart(current => addPackLine(current, selectedModel, selectedColour, selectedPack, quantity));
    setNumberOfPacks(1);
  };

  const subtotal = useMemo(() => cart.reduce((sum, line) => addMoney(sum, multiplyMoney(multiplyMoney(line.model.price, line.pack.sizesPerPack), line.numberOfPacks)), '0.00'), [cart]);
  const totals = discountedMoney(subtotal, discount);
  const { totalPacks, totalPieces } = cartCounts(cart);

  const complete = async () => {
    setError('');
    const normalizedDeposit = normalizeDecimal(deposit);
    if (partialPayment && (compareMoney(normalizedDeposit, '0') < 0 || compareMoney(normalizedDeposit, totals.total) > 0)) { setError('Deposit must be between 0 and the receipt total.'); return; }
    setBusy(true);
    try {
      const sale = await createSale(cart.map(line => ({ modelId: line.model.id, colourId: line.colour.id, packId: line.pack.id, numberOfPacks: line.numberOfPacks })), {
        customerName, customerPhone, shopName, customerAddress,
        discountPercentage: normalizeDecimal(discount),
        depositAmount: partialPayment ? normalizedDeposit : undefined,
      });
      setCart([]); setCustomerName(''); setCustomerPhone(''); setShopName(''); setCustomerAddress(''); setDiscount('0'); setPartialPayment(false); setDeposit('0.00'); setReceipt(sale);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not complete the sale.'); }
    finally { setBusy(false); }
  };

  if (receipt) return <Receipt sale={receipt} onClose={() => setReceipt(null)}/>;
  return <div className="sell-layout">
    <section>
      <div className="section-head compact"><div><p className="eyebrow">NEW TRANSACTION</p><AnimatedTitle>Select packs</AnimatedTitle><p>Model → colour → pack → number of packs</p></div></div>
      <div className="search"><Search/><input aria-label="Search models and colours" value={q} onChange={event => setQ(event.target.value)} placeholder="Search model or colour..."/></div>
      <div className="selection-flow">
        <div><span>1 · Model</span><div className="model-options">{results.map(model => <button key={model.id} className={selectedModelId === model.id ? 'selected' : ''} onClick={() => { setSelectedModelId(model.id); setSelectedColourId(''); setSelectedPackId(''); }}><b>{model.modelNumber}</b><small>{formatMoney(model.price)} per size</small></button>)}</div></div>
        {selectedModel && <div><span>2 · Colour</span><div className="variant-buttons">{selectedModel.colours.filter(colour => colour.isActive).map(colour => <button key={colour.id} className={selectedColourId === colour.id ? 'selected' : ''} onClick={() => { setSelectedColourId(colour.id); setSelectedPackId(''); }}><span><i className="color-swatch" style={{ backgroundColor: colorSwatch(colour.name) }}/>{colour.name}</span></button>)}</div></div>}
        {selectedColour && <div><span>3 · Pack</span><div className="variant-buttons">{selectedColour.packs.filter(pack => pack.isActive).map(pack => { const left = packsRemaining(pack); return <button key={pack.id} disabled={!left} className={`${selectedPackId === pack.id ? 'selected ' : ''}${!left ? 'out-of-stock' : ''}`} onClick={() => setSelectedPackId(pack.id)}><span>{pack.sizesPerPack} sizes per pack</span><small>{formatMoney(multiplyMoney(selectedModel!.price, pack.sizesPerPack))} · {left} packs left</small></button>; })}</div></div>}
        {selectedPack && <div className="pack-quantity"><span>4 · Number of packs</span><NumberInput min="1" max={packsRemaining(selectedPack)} step="1" value={numberOfPacks} onChange={event => setNumberOfPacks(Math.max(1, Number(event.target.value) || 1))}/><button className="primary" disabled={!packsRemaining(selectedPack)} onClick={addSelected}><Plus/> Add {numberOfPacks} {numberOfPacks === 1 ? 'pack' : 'packs'}</button><small>{selectedPack.sizesPerPack * numberOfPacks} represented sizes · {formatMoney(multiplyMoney(multiplyMoney(selectedModel!.price, selectedPack.sizesPerPack), numberOfPacks))}</small></div>}
      </div>
    </section>
    <aside className="basket">
      <header><ShoppingBag/><div><p className="eyebrow">CURRENT SALE</p><h2>Your basket</h2></div><span>{totalPacks}</span></header>
      {!cart.length ? <div className="basket-empty"><ShoppingBag/><p>Select a model, colour, pack and number of packs.</p></div> : <motion.div className="basket-lines" layout><AnimatePresence initial={false}>{cart.map((line, index) => {
        const packPrice = multiplyMoney(line.model.price, line.pack.sizesPerPack), lineTotal = multiplyMoney(packPrice, line.numberOfPacks);
        return <motion.article key={line.pack.id} layout initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
          <div><b>{line.model.modelNumber}</b><span><i aria-hidden="true" className="color-swatch" style={{ backgroundColor: colorSwatch(line.colour.name) }}/>{line.colour.name} · {line.pack.sizesPerPack} sizes/pack</span><small>{formatMoney(packPrice)} per pack · {formatMoney(lineTotal)} line total · {line.pack.stockQuantity - line.numberOfPacks} remaining</small></div>
          <div className="quantity"><button aria-label={`Decrease packs for ${line.model.modelNumber}`} onClick={() => setCart(current => current.map((entry, position) => position === index ? { ...entry, numberOfPacks: Math.max(1, entry.numberOfPacks - 1) } : entry))}><Minus/></button><NumberInput className="quantity-input" min="1" max={line.pack.stockQuantity} step="1" value={line.numberOfPacks} aria-label={`Number of packs for ${line.model.modelNumber}, ${line.colour.name}`} onChange={event => setCart(current => current.map((entry, position) => position === index ? { ...entry, numberOfPacks: Math.min(entry.pack.stockQuantity, Math.max(1, Number(event.target.value) || 1)) } : entry))}/><button aria-label={`Increase packs for ${line.model.modelNumber}`} onClick={() => setCart(current => current.map((entry, position) => position === index ? { ...entry, numberOfPacks: Math.min(entry.numberOfPacks + 1, entry.pack.stockQuantity) } : entry))}><Plus/></button></div>
          <button className="remove" aria-label={`Remove ${line.model.modelNumber}, ${line.colour.name} from sale`} onClick={() => setCart(current => current.filter((_, position) => position !== index))}><X/></button>
        </motion.article>;
      })}</AnimatePresence></motion.div>}
      <div className="checkout-details client-details">
        <label>Client name<input value={customerName} maxLength={120} onChange={event => setCustomerName(event.target.value)} placeholder="Optional"/></label><label>Phone number<input type="tel" value={customerPhone} maxLength={40} onChange={event => setCustomerPhone(event.target.value)} placeholder="Optional"/></label><label>Shop name<input value={shopName} maxLength={120} onChange={event => setShopName(event.target.value)} placeholder="Optional"/></label><label>Address<input value={customerAddress} maxLength={500} onChange={event => setCustomerAddress(event.target.value)} placeholder="Optional"/></label>
        <label>Discount percentage<div className="discount-input"><NumberInput min="0" max="100" step="0.01" value={discount} onChange={event => setDiscount(event.target.value)}/><span>%</span></div></label>
        <label className="payment-toggle"><input type="checkbox" checked={partialPayment} onChange={event => { setPartialPayment(event.target.checked); setDeposit('0.00'); }}/> Client is paying a deposit</label>
        {partialPayment && <label className="wide">Deposit paid now<NumberInput min="0" max={totals.total} step="0.01" value={deposit} onChange={event => setDeposit(event.target.value)}/><small>Outstanding estimate: {formatMoney(compareMoney(totals.total, deposit) > 0 ? subtractMoney(totals.total, deposit) : '0.00')}</small></label>}
      </div>
      <footer>{compareMoney(totals.discount, '0') > 0 && <><div className="checkout-row"><span>Subtotal</span><b>{formatMoney(subtotal)}</b></div><div className="checkout-row discount"><span>Discount ({discount}%)</span><b>− {formatMoney(totals.discount)}</b></div></>}<div className="basket-pieces"><span>Total packs / total pcs.</span><b>{totalPacks} / {totalPieces}</b></div><div><span>Estimated total; server verifies at checkout</span><strong>{formatMoney(totals.total)}</strong></div>{partialPayment && <div className="checkout-row payment"><span>Paid now</span><b>{formatMoney(deposit)}</b></div>}{error && <p className="error" role="alert">{error}</p>}<button className="primary sale-button" disabled={!cart.length || busy} onClick={complete}><Check/> {busy ? 'Completing…' : 'Complete sale'}</button></footer>
    </aside>
  </div>;
}
