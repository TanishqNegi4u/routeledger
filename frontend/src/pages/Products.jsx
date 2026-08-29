import { useState } from 'react';
import { api } from '../lib/api.js';
import { useToast } from '../lib/toast.jsx';
import { useAsync } from '../lib/useAsync.js';
import {
  AutoFocus,
  Card,
  Drawer,
  Empty,
  ErrorState,
  Field,
  PageHeader,
  Pager,
  SkeletonRows,
  StatusBadge,
  SubmitButton,
} from '../components/ui.jsx';
import { count, fromPaise, money, toPaise } from '../lib/format.js';
import styles from './Dashboard.module.css';

/**
 * The price list. Everything downstream — standing orders, run sheets, invoices — multiplies the
 * price stored here, so a change is deliberately explicit about affecting future deliveries only.
 */

const BLANK = { name: '', unitLabel: 'litre', category: 'Milk', pricePaise: '', active: true };

const CATEGORIES = ['Milk', 'Water', 'Tiffin', 'Newspaper', 'Laundry', 'Groceries', 'Other'];

const UNITS = ['litre', '500 ml', 'can', 'packet', 'box', 'kg', 'piece', 'copy', 'load'];

export default function Products() {
  const toast = useToast();
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [issues, setIssues] = useState({});
  const [busy, setBusy] = useState(false);

  const list = useAsync(() => api.products.page({ page, size: 12 }), [page]);

  const openCreate = () => {
    setEditing('new');
    setForm(BLANK);
    setIssues({});
  };

  const openEdit = (product) => {
    setEditing(product);
    setForm({
      name: product.name || '',
      unitLabel: product.unitLabel || 'litre',
      category: product.category || 'Other',
      pricePaise: String(fromPaise(product.pricePaise)),
      active: product.active,
    });
    setIssues({});
  };

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setIssues((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const save = async (event) => {
    event.preventDefault();
    const paise = toPaise(form.pricePaise);
    const found = {};
    if (form.name.trim().length < 2) found.name = 'Name the product as the customer would say it.';
    if (!form.unitLabel.trim()) found.unitLabel = 'What is one unit — a litre, a can, a packet?';
    if (paise <= 0) found.pricePaise = 'Price must be greater than zero.';
    setIssues(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    const body = {
      name: form.name.trim(),
      unitLabel: form.unitLabel.trim(),
      category: form.category,
      pricePaise: paise,
      active: form.active,
    };
    try {
      if (editing === 'new') {
        await api.products.create(body);
        toast.success(`${body.name} added`, 'It can be attached to a standing order right away.');
      } else {
        await api.products.update(editing.id, body);
        toast.success(`${body.name} updated`, 'Deliveries already billed keep the old price.');
      }
      setEditing(null);
      list.reload();
    } catch (error) {
      const fromServer = {};
      (error.fieldErrors || []).forEach((issue) => {
        fromServer[issue.field] = issue.message;
      });
      if (Object.keys(fromServer).length) setIssues(fromServer);
      toast.fromError(error, 'Could not save this product');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (product) => {
    try {
      await api.products.setActive(product.id, !product.active);
      toast.success(product.active ? `${product.name} delisted` : `${product.name} listed again`);
      list.reload();
    } catch (error) {
      toast.fromError(error, 'Could not change that product');
    }
  };

  return (
    <>
      <PageHeader
        title="Price list"
        subtitle="What you sell and what one unit costs. Prices are stored in paise, so no rounding creeps into a month of bills."
      >
        <button type="button" className="btn btn-primary" onClick={openCreate}>
          Add product
        </button>
      </PageHeader>

      <Card flush title="Products" subtitle="Delisting keeps history intact but hides the product from new orders">
        {list.error ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : list.loading ? (
          <SkeletonRows rows={6} cols={5} />
        ) : (list.data?.content || []).length === 0 ? (
          <Empty
            glyph="◫"
            title="Nothing on the price list"
            text="Add the first product — a litre of milk, a 20-litre can, a tiffin — and households can subscribe to it."
          >
            <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
              Add product
            </button>
          </Empty>
        ) : (
          <>
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th className="right">Price</th>
                    <th className="right">On order</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.data.content.map((product) => (
                    <tr key={product.id} className={product.active ? '' : 'row-dim'}>
                      <td>
                        {product.name}
                        <div className="hint">per {product.unitLabel}</div>
                      </td>
                      <td className="nowrap">{product.category}</td>
                      <td className="right num nowrap">{money(product.pricePaise)}</td>
                      <td className="right num">{count(product.activeSubscriptions)}</td>
                      <td>
                        <StatusBadge value={product.active ? 'ACTIVE' : 'INACTIVE'} />
                      </td>
                      <td className="right nowrap">
                        <button type="button" className="btn btn-sm" onClick={() => openEdit(product)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost"
                          onClick={() => toggleActive(product)}
                        >
                          {product.active ? 'Delist' : 'Relist'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={list.data.page}
              size={list.data.size}
              totalElements={list.data.totalElements}
              totalPages={list.data.totalPages}
              onPage={setPage}
              busy={list.loading}
            />
          </>
        )}
      </Card>

      <Drawer
        open={Boolean(editing)}
        title={editing === 'new' ? 'Add product' : `Edit ${editing?.name || ''}`}
        subtitle="Price changes apply to deliveries from today onward. Bills already issued are untouched."
        onClose={() => setEditing(null)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </button>
            <SubmitButton busy={busy} form="product-form">
              {editing === 'new' ? 'Add product' : 'Save changes'}
            </SubmitButton>
          </>
        }
      >
        <form id="product-form" className="col" style={{ gap: 'var(--s-4)' }} onSubmit={save} noValidate>
          <Field label="Name" htmlFor="prodName" error={issues.name}>
            <AutoFocus>
              <input
                id="prodName"
                className="input"
                value={form.name}
                onChange={set('name')}
                placeholder="Cow milk"
                required
              />
            </AutoFocus>
          </Field>

          <div className={styles.duo} style={{ marginTop: 0 }}>
            <Field label="Category" htmlFor="category">
              <select id="category" className="select" value={form.category} onChange={set('category')}>
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Unit" htmlFor="unitLabel" error={issues.unitLabel} hint="How the customer counts it">
              <input
                id="unitLabel"
                className="input"
                list="unit-options"
                value={form.unitLabel}
                onChange={set('unitLabel')}
                required
              />
              <datalist id="unit-options">
                {UNITS.map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
            </Field>
          </div>

          <Field
            label="Price in ₹ per unit"
            htmlFor="pricePaise"
            error={issues.pricePaise}
            hint={
              toPaise(form.pricePaise) > 0
                ? `Stored as ${toPaise(form.pricePaise)} paise · shown as ${money(toPaise(form.pricePaise))}`
                : 'Decimals are fine — 27.50 becomes 2750 paise'
            }
          >
            <input
              id="pricePaise"
              className="input"
              inputMode="decimal"
              value={form.pricePaise}
              onChange={set('pricePaise')}
              placeholder="62"
              required
            />
          </Field>

          <label className="check">
            <input type="checkbox" checked={form.active} onChange={set('active')} />
            <span>
              Listed
              <span className="hint" style={{ display: 'block' }}>
                Delisted products stay on existing standing orders and old bills, but cannot be added to a
                new order.
              </span>
            </span>
          </label>
        </form>
      </Drawer>
    </>
  );
}
