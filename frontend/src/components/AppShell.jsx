import { useEffect, useState } from 'react';
import { Link, useLocation } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';
import { initials, weekdayDate } from '../lib/format.js';
import styles from './AppShell.module.css';

/**
 * The authenticated layout: role-aware sidebar, sticky breadcrumb bar, content column.
 *
 * Navigation is filtered by role rather than merely hidden - an agent has no reason to see the
 * billing or catalogue screens, and the backend would reject the writes anyway.
 */

const NAV = [
  {
    label: 'Round',
    items: [
      { to: '/app', glyph: '◧', text: 'Dashboard', roles: ['OWNER', 'MANAGER'] },
      { to: '/app/my-round', glyph: '◈', text: 'My round', roles: ['AGENT'] },
      { to: '/app/runs', glyph: '⌗', text: 'Runs & routing', roles: ['OWNER', 'MANAGER'] },
    ],
  },
  {
    label: 'Book',
    items: [
      { to: '/app/customers', glyph: '☰', text: 'Customers', roles: ['OWNER', 'MANAGER', 'AGENT'] },
      { to: '/app/beats', glyph: '⛢', text: 'Beats', roles: ['OWNER', 'MANAGER'] },
      { to: '/app/products', glyph: '◇', text: 'Catalogue', roles: ['OWNER', 'MANAGER'] },
    ],
  },
  {
    label: 'Money',
    items: [
      { to: '/app/invoices', glyph: '▤', text: 'Invoices', roles: ['OWNER', 'MANAGER'] },
      { to: '/app/collections', glyph: '▲', text: 'Collections', roles: ['OWNER', 'MANAGER', 'AGENT'] },
    ],
  },
];

const TITLES = {
  '/app': 'Dashboard',
  '/app/my-round': 'My round',
  '/app/runs': 'Runs & routing',
  '/app/customers': 'Customers',
  '/app/beats': 'Beats',
  '/app/products': 'Catalogue',
  '/app/invoices': 'Invoices',
  '/app/collections': 'Collections',
  '/app/settings': 'Settings',
};

export default function AppShell({ children }) {
  const { user, business, role, logout } = useAuth();
  const { path } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [path]);

  const crumb =
    TITLES[path] ||
    (path.startsWith('/app/customers/') && 'Customer') ||
    (path.startsWith('/app/runs/') && 'Run sheet') ||
    (path.startsWith('/app/invoices/') && 'Invoice') ||
    'RouteLedger';

  const isActive = (to) => path === to || (to !== '/app' && path.startsWith(`${to}/`));

  return (
    <div className={styles.shell}>
      <div
        className={open ? styles.scrimOpen : styles.scrim}
        onClick={() => setOpen(false)}
        role="presentation"
      />
      <nav className={`${styles.nav} ${open ? styles.navOpen : ''}`} aria-label="Main">
        <Link to={role === 'AGENT' ? '/app/my-round' : '/app'} className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            RL
          </span>
          <span className={styles.brandText}>
            <span className={styles.brandName}>RouteLedger</span>
            <span className={styles.brandOrg}>{business?.name || 'Your round'}</span>
          </span>
        </Link>

        {NAV.map((group) => {
          const visible = group.items.filter((item) => item.roles.includes(role));
          if (!visible.length) return null;
          return (
            <div className={styles.group} key={group.label}>
              <span className={styles.groupLabel}>{group.label}</span>
              {visible.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`${styles.item} ${isActive(item.to) ? styles.itemActive : ''}`}
                  aria-current={isActive(item.to) ? 'page' : undefined}
                >
                  <span className={styles.glyph} aria-hidden="true">
                    {item.glyph}
                  </span>
                  {item.text}
                </Link>
              ))}
            </div>
          );
        })}

        <div className={styles.navFoot}>
          <Link
            to="/app/settings"
            className={`${styles.item} ${isActive('/app/settings') ? styles.itemActive : ''}`}
          >
            <span className={styles.glyph} aria-hidden="true">
              ⚙
            </span>
            Settings
          </Link>
          <div className={styles.who}>
            <span className={styles.avatar} aria-hidden="true">
              {initials(user?.name)}
            </span>
            <span className="grow" style={{ minWidth: 0 }}>
              <span className={styles.whoName}>{user?.name}</span>
              <span className={styles.whoRole}>
                {role ? role[0] + role.slice(1).toLowerCase() : ''}
              </span>
            </span>
          </div>
          <button type="button" className={styles.signOut} onClick={() => logout('/')}>
            Sign out
          </button>
        </div>
      </nav>

      <div className={styles.main}>
        <header className={styles.top}>
          <button
            type="button"
            className={styles.burger}
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
            aria-expanded={open}
          >
            ☰
          </button>
          <span className={styles.crumb}>{crumb}</span>
          <span className="grow" />
          <span className="hint num no-print">{weekdayDate()}</span>
        </header>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}

export { styles as shellStyles };
