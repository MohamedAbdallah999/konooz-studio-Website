import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Plus, Pencil, X, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, deleteModel, now, saveModel, uid } from '../db';
import type { ModelColour, Pack, ProductModel } from '../types';
import { optimizeModelPhoto } from '../image';
import { colorSwatch } from '../colorSwatch';
import { formatMoney, multiplyMoney, normalizeDecimal } from '../money';
import './Inventory.css';
import { AnimatedTitle } from '../components/AnimatedTitle';
import { NumberInput } from '../components/NumberInput';

const newPack = (modelColourId: string): Pack => ({ id: uid(), modelColourId, sizesPerPack: 1, stockQuantity: 0, isActive: true, createdAt: now(), updatedAt: now(), syncStatus: 'pending' });
const newColour = (modelId: string): ModelColour => {
  const id = uid();
  return { id, modelId, name: '', isActive: true, packs: [newPack(id)], createdAt: now(), updatedAt: now(), syncStatus: 'pending' };
};
const blank = (): ProductModel => {
  const id = uid(), time = now();
  return { id, modelNumber: '', price: '0.00', material: '', photoUrl: '', isActive: true, colours: [newColour(id)], createdAt: time, updatedAt: time, syncStatus: 'pending' };
};

export function Inventory() {
  const [q, setQ] = useState(''), [editing, setEditing] = useState<ProductModel | null>(null);
  useEffect(() => {
    if (!editing) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [editing]);
  const models = useLiveQuery(() => {
    const query = q.trim().toLowerCase();
    return db.models.filter(model => model.isActive && (!query || [model.modelNumber, model.price, model.material ?? '', ...model.colours.flatMap(colour => [colour.name, ...colour.packs.flatMap(pack => [String(pack.sizesPerPack), String(pack.stockQuantity)])])].some(value => value.toLowerCase().includes(query)))).reverse().sortBy('updatedAt');
  }, [q]) ?? [];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    try { await saveModel({ ...editing, price: normalizeDecimal(editing.price) }); setEditing(null); }
    catch (error) { alert(error instanceof Error ? error.message : 'Unable to save this model.'); }
  };
  const remove = async (model: ProductModel) => {
    if (!confirm(`Deactivate model ${model.modelNumber} and all of its packs?`)) return;
    try { await deleteModel(model); } catch (error) { alert(error instanceof Error ? error.message : 'Unable to deactivate this model.'); }
  };
  const updateColour = (colourId: string, changes: Partial<ModelColour>) => editing && setEditing({ ...editing, colours: editing.colours.map(colour => colour.id === colourId ? { ...colour, ...changes } : colour) });
  const updatePack = (colourId: string, packId: string, changes: Partial<Pack>) => editing && setEditing({ ...editing, colours: editing.colours.map(colour => colour.id === colourId ? { ...colour, packs: colour.packs.map(pack => pack.id === packId ? { ...pack, ...changes } : pack) } : colour) });

  return <div className="inventory-page">
    <section className="section-head inventory-head"><div><p className="eyebrow">COLLECTION</p><AnimatedTitle>Inventory</AnimatedTitle><p>Models, colours, pack configurations and available packs.</p></div><button className="primary" onClick={() => setEditing(blank())}><Plus size={18}/> Add model</button></section>
    <div className="search inventory-search"><Search size={19}/><input aria-label="Search inventory" placeholder="Search model, colour, pack or material..." value={q} onChange={event => setQ(event.target.value)}/><span>{models.length} models</span></div>
    <div className="inventory-grid">{models.map(model => <motion.article layout key={model.id} className="item-card">
      <div className="item-art">{model.photoUrl ? <img src={model.photoUrl} alt={`Model ${model.modelNumber}`}/> : <span>{model.modelNumber.slice(0, 2).toUpperCase()}</span>}<button onClick={() => setEditing(structuredClone(model))} aria-label={`Edit ${model.modelNumber}`}><Pencil size={16}/></button></div>
      <div className="item-info"><div className="item-heading"><div><small>MODEL</small><h3>{model.modelNumber}</h3><strong>{formatMoney(model.price)} base price</strong></div>{model.material && <span className="item-material">{model.material}</span>}</div>
        <div className="chips">{model.colours.flatMap(colour => colour.packs.map(pack => <span key={pack.id} className={pack.stockQuantity <= 0 ? 'stock-out' : pack.stockQuantity <= 3 ? 'stock-low' : ''}><i className="color-swatch" style={{ backgroundColor: colorSwatch(colour.name) }}/>{colour.name} · {pack.sizesPerPack} sizes · {formatMoney(multiplyMoney(model.price, pack.sizesPerPack))} · {pack.stockQuantity} packs</span>))}</div>
        <div className="item-meta"><button onClick={() => remove(model)} aria-label={`Deactivate ${model.modelNumber}`}><Trash2 size={15}/></button></div>
      </div>
    </motion.article>)}</div>
    {!models.length && <div className="empty"><div className="empty-icon">K</div><h3>No models found</h3><p>Try another search or add the first model.</p></div>}
    <AnimatePresence>{editing && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => event.target === event.currentTarget && setEditing(null)}>
      <motion.form className="modal" role="dialog" aria-modal="true" aria-labelledby="model-dialog-title" onKeyDown={event=>{if(event.key==='Escape')setEditing(null)}} onSubmit={submit} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}>
        <header><div><p className="eyebrow">MODEL CONFIGURATION</p><h2 id="model-dialog-title">{models.some(model => model.id === editing.id) ? 'Edit model' : 'New model'}</h2></div><button type="button" className="icon" onClick={() => setEditing(null)} aria-label="Close"><X/></button></header>
        <div className="form-grid">
          <label>Model number<input autoFocus value={editing.modelNumber} onChange={event => setEditing({ ...editing, modelNumber: event.target.value })} required/></label>
          <label>Base price per size (EGP)<NumberInput inputMode="decimal" min="0" step="0.01" value={editing.price} onChange={event => setEditing({ ...editing, price: event.target.value })} required/></label>
          <label>Model photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; try { setEditing({ ...editing, photoUrl: await optimizeModelPhoto(file) }); } catch (error) { alert(error instanceof Error ? error.message : 'Unable to process this image.'); event.target.value = ''; } }}/><small>JPEG, PNG, or WebP up to 15 MB. Large photos are optimized automatically.</small>{editing.photoUrl && <span className="photo-preview"><img src={editing.photoUrl} alt="Selected model preview"/><button type="button" onClick={() => setEditing({ ...editing, photoUrl: '' })}>Remove photo</button></span>}</label>
          <label>Fabric / material<textarea value={editing.material ?? ''} onChange={event => setEditing({ ...editing, material: event.target.value })}/></label>
        </div>
        <div className="variants model-colours"><div><div><h3>Colours and packs</h3><small>Stock is the number of available packs. Pack price is calculated from sizes per pack.</small></div><button type="button" onClick={() => setEditing({ ...editing, colours: [...editing.colours, newColour(editing.id)] })}><Plus size={15}/> Add colour</button></div>
          {editing.colours.filter(colour => colour.isActive).map(colour => <section className="colour-editor" key={colour.id}>
            <header><label>Colour name<input placeholder="Colour" value={colour.name} onChange={event => updateColour(colour.id, { name: event.target.value })} required/></label><button type="button" disabled={editing.colours.filter(entry => entry.isActive).length === 1} onClick={() => updateColour(colour.id, { isActive: false, packs: colour.packs.map(pack => ({ ...pack, isActive: false })) })} aria-label="Remove colour"><X size={17}/></button></header>
            {colour.packs.filter(pack => pack.isActive).map(pack => <div className="pack-row" key={pack.id}>
              <label>Sizes per pack<NumberInput inputMode="numeric" min="1" step="1" value={pack.sizesPerPack} onChange={event => updatePack(colour.id, pack.id, { sizesPerPack: Number(event.target.value) })} required/></label>
              <label>Packs available<NumberInput inputMode="numeric" min="0" step="1" value={pack.stockQuantity} onChange={event => updatePack(colour.id, pack.id, { stockQuantity: Number(event.target.value) })} required/></label>
              <span>Pack price <b>{formatMoney(multiplyMoney(editing.price, pack.sizesPerPack))}</b></span>
              <button type="button" disabled={colour.packs.filter(entry => entry.isActive).length === 1} onClick={() => updatePack(colour.id, pack.id, { isActive: false })} aria-label="Remove pack"><X size={17}/></button>
            </div>)}
            <button className="add-pack" type="button" onClick={() => updateColour(colour.id, { packs: [...colour.packs, newPack(colour.id)] })}><Plus size={14}/> Add pack</button>
          </section>)}
        </div>
        <footer><button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button><button className="primary">Save model</button></footer>
      </motion.form>
    </motion.div>}</AnimatePresence>
  </div>;
}
