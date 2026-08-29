import { useEffect, useRef, useState } from 'react';
import { Link } from '../lib/router.jsx';
import { useAuth } from '../lib/auth.jsx';
import styles from './Landing.module.css';

/**
 * Public landing page. Written for one reader: the person who currently runs a subscription
 * delivery round out of a notebook and a WhatsApp group.
 */

const PAINS = [
  {
    cost: '₹6,000/mo',
    title: 'Milk delivered to an empty house',
    text: 'A family leaves for a wedding, tells the agent, and nobody tells the ledger. It gets delivered, and it gets billed. Both sides lose.',
  },
  {
    cost: '3 hrs/mo',
    title: 'Month-end billing by hand',
    text: 'Forty-eight households, thirty-one days, three products each. One arithmetic slip is a customer who never trusts a bill again.',
  },
  {
    cost: '11-18%',
    title: 'A route that grew by accident',
    text: 'The order of the round is whatever it was when the last customer joined. Nobody has re-planned it since, because re-planning it by hand is impossible.',
  },
  {
    cost: '₹40,000',
    title: 'Dues that quietly age out',
    text: 'The oldest balances are the least visible. By the time anyone notices, the household has already moved and the money is gone.',
  },
];

const FEATURES = [
  {
    glyph: '⌗',
    title: 'The round plans itself, every night',
    text: 'One click sequences every active beat from its depot. New customers slot in where they belong instead of at the end of the list, and the sheet shows how much distance the plan saved against yesterday’s order.',
    wide: true,
  },
  {
    glyph: '◈',
    title: 'A doorstep view that works one-handed',
    text: 'Agents get an ordered list with phone, landmark and today’s items. Delivered, absent or skipped is one tap, and it commits optimistically so a weak signal never blocks the round.',
  },
  {
    glyph: '⏸',
    title: 'Pauses that actually hold',
    text: 'Record a vacation window once. Overlapping windows are rejected, the stop disappears from the sheet for those dates, and the invoice never sees it.',
  },
  {
    glyph: '▤',
    title: 'Invoices built from deliveries',
    text: 'Month-end bills are assembled from what the agent actually marked delivered, line by line, with a printable copy you can send on WhatsApp.',
  },
  {
    glyph: '▲',
    title: 'A collections queue, ranked',
    text: 'Not a list of everyone who owes you. A ranked queue: amount, age, how many bills are open and how reliably the household is reachable, with the suggested next action on each row.',
  },
  {
    glyph: '⛢',
    title: 'Beat splitting when you outgrow one agent',
    text: 'Ask for three clusters and the planner groups households geographically, so a beat splits along streets rather than along the alphabet.',
  },
];

const ALGOS = [
  {
    name: 'Dijkstra + 2-opt',
    title: 'Morning route sequencing',
    text: 'Haversine distances feed a k-nearest-neighbour sparse graph built with our own binary heap, all-pairs shortest paths come from our own Dijkstra, then a nearest-neighbour tour is improved by 2-opt until no swap helps.',
    big: 'O(V·E log V) plan, O(n²) per 2-opt sweep',
  },
  {
    name: 'Interval tree',
    title: 'Pause windows',
    text: 'An augmented AVL tree keyed on start date with the maximum end date carried on every node. Answering "is this household paused on the 14th?" is a tree descent, not a scan of every pause ever recorded.',
    big: 'O(log n) query, O(log n) insert',
  },
  {
    name: 'Union-Find + Kruskal',
    title: 'Beat clustering',
    text: 'Single-linkage clustering over a minimum spanning tree. Edges are added cheapest-first through a disjoint-set forest with path compression, and cutting the k-1 longest edges leaves k geographic clusters.',
    big: 'O(E log E), near-constant union',
  },
  {
    name: 'Max-heap',
    title: 'Collections priority',
    text: 'Every household with an open balance is scored on amount, days overdue, number of open bills and reachability, then pushed into a binary max-heap so the riskiest money surfaces first without sorting the whole book.',
    big: 'O(n log k) for the top k',
  },
  {
    name: 'Trie',
    title: 'Instant customer search',
    text: 'Names and phone numbers are indexed into a prefix tree per tenant, so an agent standing at a gate finds the right household in three keystrokes. Falls back to SQL when the index is cold.',
    big: 'O(len) per lookup',
  },
];

const PLANS = [
  {
    name: 'Starter',
    for: 'One agent, one beat',
    amount: '₹499',
    per: '/month',
    featured: false,
    items: [
      'Up to 120 customers',
      '1 beat, 1 agent login',
      'Route sequencing and pause windows',
      'Month-end invoicing and receipts',
      'Email support',
    ],
  },
  {
    name: 'Growth',
    for: 'The usual dairy or tiffin round',
    amount: '₹1,299',
    per: '/month',
    featured: true,
    items: [
      'Up to 600 customers',
      'Unlimited beats and agent logins',
      'Beat splitting and 2-opt optimisation',
      'Ranked collections queue',
      'Printable bills and payment history',
      'WhatsApp-ready invoice copy',
    ],
  },
  {
    name: 'Business',
    for: 'Multi-locality operations',
    amount: '₹2,999',
    per: '/month',
    featured: false,
    items: [
      'Unlimited customers',
      'Everything in Growth',
      'Manager role with scoped access',
      'Data export and API access',
      'Priority support with onboarding',
    ],
  },
];

const QUOTES = [
  {
    text: 'We were running 214 houses out of two notebooks. The first thing that changed was not the route — it was that my agent stopped calling me to ask who is on holiday.',
    name: 'Sudhir Kale',
    role: 'Amrut Dairy, Kothrud',
    initials: 'SK',
  },
  {
    text: 'Month-end used to take my wife an entire Sunday. Now I generate bills on the 1st, send them on WhatsApp, and the arguments about "I was not home that week" are over.',
    name: 'Farida Sheikh',
    role: 'Sheikh Tiffin Service, Kondhwa',
    initials: 'FS',
  },
  {
    text: 'The collections screen is the part I did not expect. It told me three houses were 60 days behind that I would have chased last. Recovered ₹31,000 in a fortnight.',
    name: 'Rakesh Yadav',
    role: 'Yadav Water Supply, Viman Nagar',
    initials: 'RY',
  },
];

const FAQS = [
  {
    q: 'Do I need GPS coordinates for every house?',
    a: 'No. A rough coordinate is enough, and you can drop one from any map app in a couple of seconds. Households without coordinates still appear on the sheet — they are placed after the optimised stops rather than being left out, so nothing is ever missed while you fill the data in.',
  },
  {
    q: 'What happens on a day with no network at the doorstep?',
    a: 'Every stop update is applied on the agent’s screen immediately and sent in the background. If the request fails the row rolls back visibly with a message, so an agent is never left guessing whether a delivery was recorded.',
  },
  {
    q: 'Can I bill for something that was not a standing order?',
    a: 'Yes. An agent can correct quantities at the doorstep — an extra litre, half a loaf — and the invoice is built from those corrected lines, not from the subscription. You can also apply a one-off adjustment to any invoice with a reason attached.',
  },
  {
    q: 'Is my data separated from other businesses?',
    a: 'Every record carries a business id, and that id is read from your signed session token rather than from anything the browser sends. A request cannot ask for another tenant’s data even if it tries.',
  },
  {
    q: 'What if I want to leave?',
    a: 'Export your customers, subscriptions, deliveries, invoices and payments at any time on the Business plan, and on request on any plan. It is your book — we just keep it in order.',
  },
];

const STOPS = [
  { seq: 1, name: 'Kale, Flat 4B', meta: '2 × Toned milk · Gate code 22', tag: 'Delivered', tone: 'tagDone' },
  { seq: 2, name: 'Deshpande, Row 7', meta: '1 × Cow milk, 1 × Curd', tag: 'Delivered', tone: 'tagDone' },
  { seq: 3, name: 'Iyer, Bungalow', meta: 'On holiday until 6 Sep', tag: 'Paused', tone: 'tagPause' },
  { seq: 4, name: 'Sheikh, Shop 12', meta: '4 × Toned milk · Ring twice', tag: 'Pending', tone: 'tagWait' },
  { seq: 5, name: 'Naik, 2nd floor', meta: '1 × Bread, 1 × Buttermilk', tag: 'Pending', tone: 'tagWait' },
];

export default function Landing() {
  const { isAuthenticated, role } = useAuth();
  const [openFaq, setOpenFaq] = useState(0);
  const mockRef = useRef(null);
  const appHome = role === 'AGENT' ? '/app/my-round' : '/app';

  useEffect(() => {
    const targets = document.querySelectorAll(`.${styles.reveal}`);
    if (!targets.length) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.revealVisible);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleHeroMouseMove = (event) => {
    const el = mockRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const deltaX = (event.clientX - centerX) / (rect.width / 2);
    const deltaY = (event.clientY - centerY) / (rect.height / 2);
    const tiltX = Math.max(-4, Math.min(4, -deltaY * 4));
    const tiltY = Math.max(-4, Math.min(4, deltaX * 4));
    el.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-2px)`;
  };

  const handleHeroMouseLeave = () => {
    const el = mockRef.current;
    if (!el) return;
    el.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)';
  };

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <Link to="/" className={styles.brand}>
            <span className={styles.mark} aria-hidden="true">
              RL
            </span>
            RouteLedger
          </Link>
          <nav className={styles.barLinks} aria-label="Sections">
            <a className={styles.barLink} href="#problem">
              Problem
            </a>
            <a className={styles.barLink} href="#features">
              Product
            </a>
            <a className={styles.barLink} href="#machine">
              How it works
            </a>
            <a className={styles.barLink} href="#pricing">
              Pricing
            </a>
          </nav>
          <div className={styles.barActions}>
            {isAuthenticated ? (
              <Link to={appHome} className="btn btn-primary btn-sm">
                Open my round
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-ghost btn-sm" style={{ color: '#cbd5e1' }}>
                  Sign in
                </Link>
                <Link to="/register" className="btn btn-primary btn-sm">
                  Start free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className={styles.hero} onMouseMove={handleHeroMouseMove} onMouseLeave={handleHeroMouseLeave}>
        <div className={styles.heroInner}>
          <div>
            <span className={styles.kicker}>For dairy, water, tiffin, laundry and paper rounds</span>
            <h1 className={styles.h1}>
              Your delivery round, <em>sequenced, billed and collected</em>.
            </h1>
            <p className={styles.lede}>
              RouteLedger is the operations backbone for subscription delivery businesses. It plans
              tomorrow&rsquo;s route, honours every pause, bills from what was actually delivered, and tells
              you which household to chase first — from one screen, before the first bottle leaves the crate.
            </p>
            <div className={styles.heroCtas}>
              <Link to="/register" className="btn btn-primary btn-lg">
                Start free for 14 days
              </Link>
              <Link to="/login" className="btn btn-invert btn-lg">
                See the live demo
              </Link>
            </div>
            <p className={styles.heroNote}>
              Demo tenant pre-loaded with 48 households, 3 beats and 45 days of history.
            </p>
            <div className={styles.heroStats}>
              <span>
                <span className={styles.statValue}>11-18%</span>
                <span className={styles.statLabel}>Distance saved per beat</span>
              </span>
              <span>
                <span className={styles.statValue}>4 min</span>
                <span className={styles.statLabel}>Month-end billing</span>
              </span>
              <span>
                <span className={styles.statValue}>6</span>
                <span className={styles.statLabel}>Algorithms, hand-written</span>
              </span>
            </div>
          </div>

          <div className={styles.mock} ref={mockRef} aria-hidden="true">
            <div className={styles.mockBar}>
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.dot} />
              <span className={styles.mockTitle}>Kothrud beat · today · Ravi</span>
            </div>
            <div className={styles.mockBody}>
              {STOPS.map((stop) => (
                <div className={styles.mockRow} key={stop.seq}>
                  <span className={styles.mockSeq}>{stop.seq}</span>
                  <span>
                    <span className={styles.mockName}>{stop.name}</span>
                    <span className={styles.mockMeta} style={{ display: 'block' }}>
                      {stop.meta}
                    </span>
                  </span>
                  <span className={`${styles.mockTag} ${styles[stop.tone]}`}>{stop.tag}</span>
                </div>
              ))}
            </div>
            <div className={styles.mockFoot}>
              <span>16 stops · 2 of 16 done</span>
              <span>7.4 km planned · 1.2 km saved</span>
            </div>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.reveal}`} id="problem">
        <span className={styles.eyebrow}>The status quo</span>
        <h2 className={styles.h2}>Four leaks, and none of them show up in a bank statement.</h2>
        <p className={styles.blurb}>
          A subscription round is a business with excellent revenue visibility and terrible cost
          visibility. The money does not disappear in one place — it drains out of four, every single
          month, and the notebook cannot see any of them.
        </p>
        <div className={styles.painGrid}>
          {PAINS.map((pain) => (
            <article className={styles.pain} key={pain.title}>
              <div className={styles.painCost}>{pain.cost}</div>
              <h3 className={styles.painTitle}>{pain.title}</h3>
              <p className={styles.painText}>{pain.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.reveal}`} id="features">
        <span className={styles.eyebrow}>The product</span>
        <h2 className={styles.h2}>One screen for the round, the book and the money.</h2>
        <p className={styles.blurb}>
          Not a CRM you have to feed. RouteLedger is fed by the round itself — the agent taps the
          doorstep, and the route plan, the invoice and the collections queue all move on their own.
        </p>
        <div className={styles.featureGrid}>
          {FEATURES.map((feature) => (
            <article
              className={`${styles.feature} ${feature.wide ? styles.featureWide : ''}`}
              key={feature.title}
            >
              <div className={styles.featureGlyph} aria-hidden="true">
                {feature.glyph}
              </div>
              <h3 className={styles.featureTitle}>{feature.title}</h3>
              <p className={styles.featureText}>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.machine} ${styles.reveal}`} id="machine">
        <div className={styles.machineInner}>
          <span className={styles.eyebrow} style={{ color: '#a5b4fc' }}>
            Under the bonnet
          </span>
          <h2 className={styles.h2} style={{ color: '#fff' }}>
            Six data structures, written by hand, doing real work.
          </h2>
          <p className={styles.blurb} style={{ color: '#94a3b8' }}>
            No optimisation library, no solver service, no geospatial database. The route, the pauses,
            the beat split and the dues queue are each computed by a structure implemented from scratch
            in Java — which is why the whole thing plans a 200-house round in well under a second on a
            single small container.
          </p>
          <div className={styles.machineGrid}>
            {ALGOS.map((algo) => (
              <article className={styles.algo} key={algo.name}>
                <div className={styles.algoName}>{algo.name}</div>
                <h3 className={styles.algoTitle}>{algo.title}</h3>
                <p className={styles.algoText}>{algo.text}</p>
                <div className={styles.algoBig}>{algo.big}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.center} ${styles.reveal}`} id="pricing">
        <span className={styles.eyebrow}>Pricing</span>
        <h2 className={styles.h2Center}>Priced against one afternoon of your month.</h2>
        <p className={styles.blurb} style={{ marginLeft: 'auto', marginRight: 'auto' }}>
          Every plan includes route sequencing, pause windows and invoicing. No per-delivery fee, no
          commission on collections, no charge for agent logins on Growth and above.
        </p>
        <div className={styles.priceGrid}>
          {PLANS.map((plan) => (
            <article
              className={`${styles.plan} ${plan.featured ? styles.planFeatured : ''}`}
              key={plan.name}
              style={{ textAlign: 'left' }}
            >
              {plan.featured ? <span className={styles.planTag}>Most rounds</span> : null}
              <div>
                <div className={styles.planName}>{plan.name}</div>
                <div className={styles.planFor}>{plan.for}</div>
              </div>
              <div className={styles.planPrice}>
                <span className={styles.planAmount}>{plan.amount}</span>
                <span className={styles.planPer}>{plan.per}</span>
              </div>
              <div className={styles.planList}>
                {plan.items.map((item) => (
                  <span className={styles.planItem} key={item}>
                    <span className={styles.tick} aria-hidden="true">
                      ✓
                    </span>
                    {item}
                  </span>
                ))}
              </div>
              <Link
                to="/register"
                className={`btn btn-block ${plan.featured ? 'btn-primary' : ''}`}
                style={{ marginTop: 'auto' }}
              >
                Start free
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className={`${styles.sectionTight} ${styles.reveal}`}>
        <span className={styles.eyebrow}>Operators</span>
        <h2 className={styles.h2}>What changes in the first fortnight.</h2>
        <div className={styles.quoteGrid}>
          {QUOTES.map((quote) => (
            <figure className={styles.quote} key={quote.name}>
              <blockquote className={styles.quoteText}>&ldquo;{quote.text}&rdquo;</blockquote>
              <figcaption className={styles.quoteWho}>
                <span className={styles.quoteAvatar} aria-hidden="true">
                  {quote.initials}
                </span>
                <span>
                  <span className={styles.quoteName} style={{ display: 'block' }}>
                    {quote.name}
                  </span>
                  <span className={styles.quoteRole}>{quote.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.center} ${styles.reveal}`} id="faq">
        <span className={styles.eyebrow}>Questions</span>
        <h2 className={styles.h2Center}>The five things every operator asks.</h2>
        <div className={styles.faqList} style={{ textAlign: 'left' }}>
          {FAQS.map((faq, index) => {
            const open = openFaq === index;
            return (
              <div className={styles.faq} key={faq.q}>
                <button
                  type="button"
                  className={styles.faqQ}
                  aria-expanded={open}
                  onClick={() => setOpenFaq(open ? -1 : index)}
                >
                  {faq.q}
                  <span className={styles.faqSign} aria-hidden="true">
                    {open ? '−' : '+'}
                  </span>
                </button>
                {open ? <p className={styles.faqA}>{faq.a}</p> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className={`${styles.cta} ${styles.reveal}`}>
        <div className={styles.ctaInner}>
          <div>
            <h2 className={styles.ctaTitle}>Plan tomorrow&rsquo;s round tonight.</h2>
            <p className={styles.ctaText}>
              Fourteen days free, no card. Or open the demo tenant and walk a real 48-household round
              with 45 days of history behind it.
            </p>
          </div>
          <div className={styles.heroCtas} style={{ marginTop: 0 }}>
            <Link to="/register" className="btn btn-primary btn-lg">
              Start free
            </Link>
            <Link to="/login" className="btn btn-invert btn-lg">
              Open the demo
            </Link>
          </div>
        </div>
      </section>

      <footer className={styles.foot}>
        <div className={styles.footInner}>
          <span>© {new Date().getFullYear()} RouteLedger · Built for subscription delivery rounds</span>
          <div className={styles.footLinks}>
            <a className={styles.footLink} href="#problem">
              Problem
            </a>
            <a className={styles.footLink} href="#features">
              Product
            </a>
            <a className={styles.footLink} href="#machine">
              How it works
            </a>
            <a className={styles.footLink} href="#pricing">
              Pricing
            </a>
            <a className={styles.footLink} href="/swagger-ui.html">
              API docs
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
