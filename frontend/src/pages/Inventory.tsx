import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Plus, Pencil, X, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { db, deleteItem, now, saveItem, uid } from '../db';
import type { Item, Variant } from '../types';
import { optimizeModelPhoto } from '../image';
import './Inventory.css';

const newVariant = (itemId: string): Variant => ({
  id: uid(),
  itemId,
  size: '',
  color: '',
  stockQuantity: 0,
  createdAt: now(),
  updatedAt: now(),
  syncStatus: 'pending',
});
const blank = (): Item => {
  const id = uid(),
    time = now();
  return {
    id,
    modelNumber: '',
    price: 0,
    material: '',
    photoUrl: '',
    variants: [newVariant(id)],
    createdAt: time,
    updatedAt: time,
    syncStatus: 'pending',
  };
};

export function Inventory() {
  const [q, setQ] = useState(''),
    [editing, setEditing] = useState<Item | null>(null);
  const items =
    useLiveQuery(() => {
      const query = q.trim().toLowerCase();
      return db.items
        .filter(
          (item) =>
            !item.deletedAt &&
            (!query ||
              [
                item.modelNumber,
                String(item.price),
                item.material ?? '',
                ...item.variants.flatMap((v) => [
                  v.size,
                  v.color,
                  String(v.stockQuantity),
                ]),
              ].some((value) => value.toLowerCase().includes(query))),
        )
        .reverse()
        .sortBy('updatedAt');
    }, [q]) ?? [];
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    try {
      await saveItem({
        ...editing,
        price: Number(editing.price),
        variants: editing.variants.map((v) => ({
          ...v,
          itemId: editing.id,
          stockQuantity: Number(v.stockQuantity),
        })),
      });
      setEditing(null);
    } catch (error) {
      alert(
        error instanceof Error ? error.message : 'Unable to save this model.',
      );
    }
  };
  const remove = async (item: Item) => {
    if (!confirm(`Remove model ${item.modelNumber} and all stock?`)) return;
    try {
      await deleteItem(item);
    } catch (error) {
      alert(
        error instanceof Error ? error.message : 'Unable to remove this model.',
      );
    }
  };
  const updateVariant = (index: number, changes: Partial<Variant>) =>
    editing &&
    setEditing({
      ...editing,
      variants: editing.variants.map((v, n) =>
        n === index ? { ...v, ...changes } : v,
      ),
    });
  return (
    <>
      <section className='section-head'>
        <div>
          <p className='eyebrow'>COLLECTION</p>
          <h2>Inventory</h2>
          <p>Each model, size, colour and piece, at a glance.</p>
        </div>
        <button className='primary' onClick={() => setEditing(blank())}>
          <Plus size={18} /> Add model
        </button>
      </section>
      <div className='search'>
        <Search size={19} />
        <input
          placeholder='Search model, colour, size or material...'
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span>{items.length} models</span>
      </div>
      <div className='inventory-grid'>
        {items.map((item) => (
          <motion.article layout key={item.id} className='item-card'>
            <div className='item-art'>
              {item.photoUrl ? (
                <img src={item.photoUrl} alt={`Model ${item.modelNumber}`} />
              ) : (
                <span>{item.modelNumber.slice(0, 2).toUpperCase()}</span>
              )}
              <button
                onClick={() => setEditing(structuredClone(item))}
                aria-label={`Edit ${item.modelNumber}`}
              >
                <Pencil size={16} />
              </button>
            </div>
            <div className='item-info'>
              <small>MODEL</small>
              <h3>{item.modelNumber}</h3>
              <strong>
                {new Intl.NumberFormat('en-EG', {
                  style: 'currency',
                  currency: 'EGP',
                }).format(item.price)}
              </strong>
              <div className='chips'>
                {item.variants.map((v) => (
                  <span key={v.id}>
                    {v.size} / {v.color} - {v.stockQuantity}
                  </span>
                ))}
              </div>
              <div className='item-meta'>
                {item.material && <span>{item.material}</span>}
                <button
                  onClick={() => remove(item)}
                  aria-label={`Delete ${item.modelNumber}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
      {!items.length && (
        <div className='empty'>
          <div className='empty-icon'>K</div>
          <h3>No dresses found</h3>
          <p>Try another search or add the first model.</p>
        </div>
      )}
      <AnimatePresence>
        {editing && (
          <motion.div
            className='modal-backdrop'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(e) =>
              e.target === e.currentTarget && setEditing(null)
            }
          >
            <motion.form
              className='modal'
              onSubmit={submit}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
            >
              <header>
                <div>
                  <p className='eyebrow'>COLLECTION DETAIL</p>
                  <h2>
                    {items.some((item) => item.id === editing.id)
                      ? 'Edit model'
                      : 'New model'}
                  </h2>
                </div>
                <button
                  type='button'
                  className='icon'
                  onClick={() => setEditing(null)}
                  aria-label='Close'
                >
                  <X />
                </button>
              </header>
              <div className='form-grid'>
                <label>
                  Model number
                  <input
                    value={editing.modelNumber}
                    onChange={(e) =>
                      setEditing({ ...editing, modelNumber: e.target.value })
                    }
                    required
                  />
                </label>
                <label>
                  Price (EGP)
                  <input
                    type='number'
                    min='0'
                    step='0.01'
                    value={editing.price}
                    onChange={(e) =>
                      setEditing({ ...editing, price: Number(e.target.value) })
                    }
                    required
                  />
                </label>
                <label>
                  Model photo
                  <input
                    type='file'
                    accept='image/*'
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        setEditing({
                          ...editing,
                          photoUrl: await optimizeModelPhoto(file),
                        });
                      } catch (error) {
                        alert(
                          error instanceof Error
                            ? error.message
                            : 'Unable to process this image.',
                        );
                        e.target.value = '';
                      }
                    }}
                  />
                  <small>
                    Up to 15 MB. Large photos are optimized automatically.
                  </small>
                  {editing.photoUrl && (
                    <span className='photo-preview'>
                      <img
                        src={editing.photoUrl}
                        alt='Selected model preview'
                      />
                      <button
                        type='button'
                        onClick={() => setEditing({ ...editing, photoUrl: '' })}
                      >
                        Remove photo
                      </button>
                    </span>
                  )}
                </label>
                <label>
                  Fabric / material
                  <textarea
                    value={editing.material ?? ''}
                    onChange={(e) =>
                      setEditing({ ...editing, material: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className='variants'>
                <div>
                  <div>
                    <h3>Sizes, colours and stock</h3>
                    <small>Each size and colour pair has its own stock.</small>
                  </div>
                  <button
                    type='button'
                    onClick={() =>
                      setEditing({
                        ...editing,
                        variants: [...editing.variants, newVariant(editing.id)],
                      })
                    }
                  >
                    <Plus size={15} /> Add combination
                  </button>
                </div>
                {editing.variants.map((v, n) => (
                  <div className='variant-row' key={v.id}>
                    <input
                      placeholder='Size'
                      value={v.size}
                      onChange={(e) =>
                        updateVariant(n, { size: e.target.value })
                      }
                      required
                    />
                    <input
                      placeholder='Colour'
                      value={v.color}
                      onChange={(e) =>
                        updateVariant(n, { color: e.target.value })
                      }
                      required
                    />
                    <input
                      className='stock-quantity'
                      type='number'
                      min='0'
                      step='1'
                      placeholder='Stock'
                      value={v.stockQuantity}
                      onChange={(e) =>
                        updateVariant(n, {
                          stockQuantity: Number(e.target.value),
                        })
                      }
                      required
                    />
                    <button
                      type='button'
                      disabled={editing.variants.length === 1}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          variants: editing.variants.filter((_, i) => i !== n),
                        })
                      }
                      aria-label='Remove combination'
                    >
                      <X size={17} />
                    </button>
                  </div>
                ))}
              </div>
              <footer>
                <button
                  type='button'
                  className='secondary'
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button className='primary'>Save model</button>
              </footer>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
