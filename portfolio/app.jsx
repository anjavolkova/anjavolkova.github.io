const { useState, useEffect, useRef, useCallback } = React;

/* ---------------- data ---------------- */

const PROJECTS = [
{
  id: "notion-lastfm",
  tag: "Notion × last.fm",
  status: "Shipped 2026",
  title: "Listening statistics widget for your Notion page",
  subtitle: "A widget that dynamically presents your last.fm music stats, optimised to your Notion dashboard layout.",
  description: "Redesigning Node Management System's complex interface into a faster, more intuitive workflow, cutting steps by 38% and reducing time-on-task by 45%.",
  img: "assets/widget.png",
  meta: { Role: "Product Designer\nFrontend Developer", Timeline: "2 days", Team: "Me", Skills: "Product Design\nFrontend Dev" }
},
{
  id: "kvik",
  tag: "KVIK",
  status: "Shipped",
  title: "KVIK E-Scooter app redesign",
  subtitle: "Redesigning the mobile app experience for KVIK scooters, focusing on improving usability and creating a more intuitive rental flow.",
  description: "A complete overhaul of the rental flow — from unlock to ride history — guided by ride-along research with 12 riders across Ljubljana.",
  img: "assets/kontron.png",
  meta: { Role: "Product Designer", Timeline: "8 weeks", Team: "2 designers, 3 engs", Skills: "Mobile UX\nPrototyping" }
},
{
  id: "freelance-social",
  tag: "Freelance",
  status: "Ongoing",
  title: "Social media design for local businesses",
  subtitle: "Collaborating with a photographer and social media marketer to design Instagram posts for local businesses.",
  description: "Creating cohesive visual identities and engaging content that aligns with each brand's aesthetic.",
  img: null,
  meta: { Role: "Visual Designer", Timeline: "Ongoing", Team: "3", Skills: "Identity\nSocial" }
}];


const FUN_THINGS = [
{ title: "last.fm × notion widget", status: "Shipped", done: true, bg: "linear-gradient(135deg,#f3e9f7,#ddc7e4)" },
{ title: "Book-sharing app", status: "Ongoing", bg: "linear-gradient(135deg,#e9efe6,#c8d7be)" },
{ title: "Beauty catalog app", status: "Ongoing", bg: "linear-gradient(135deg,#f6eae3,#e9c7ba)" },
{ title: "Bookstagram", status: "Ongoing", bg: "linear-gradient(135deg,#ecf0f7,#c4d0ea)" },
{ title: "Thornwood (Historical Fantasy Novel)", status: "Ongoing", bg: "linear-gradient(135deg,#e3dfe6,#9f7eb6)" },
{ title: "Python tea script", status: "Finished", done: true, bg: "linear-gradient(135deg,#eef3ee,#b3cfb6)" },
{ title: "More Than Fiction (podcast)", status: "Finished", done: true, bg: "linear-gradient(135deg,#f7eee9,#e0bea7)" }];


const CV = [
{ when: "Now", what: "Visual & social media design @osipova photography" },
{ when: "2025", what: "Graduated MSc Data-Driven Design @Hogeschool Utrecht" },
{ when: "Always", what: "Creating book content @libraryofanya" }];


const CHIPS = [
{ k: "Based in", v: "Ljubljana, SI" },
{ k: "💿 On repeat", v: "Do It Underscores U" },
{ k: "📚 Reading", v: "All Fours\nMiranda July · 18/60" }];


const CASE_SECTIONS = [
{ id: "overview", label: "Overview" },
{ id: "problem", label: "Problem" },
{ id: "process", label: "Design Process" },
{ id: "solution", label: "Solution" },
{ id: "outcome", label: "Outcome" },
{ id: "insights", label: "Insights" }];


/* ---------------- icons ---------------- */

const Icon = {
  ArrowRight: (p) =>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M5 12h14M13 5l7 7-7 7" /></svg>,

  Plus: (p) =>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 5v14M5 12h14" /></svg>,

  Mail: (p) =>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>,

  Github: (p) =>
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}><path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.3-5.23-1.28-5.23-5.68 0-1.25.44-2.28 1.17-3.08-.12-.3-.51-1.48.11-3.08 0 0 .96-.31 3.15 1.18a10.8 10.8 0 0 1 5.73 0c2.18-1.49 3.14-1.18 3.14-1.18.62 1.6.23 2.78.11 3.08.73.8 1.17 1.83 1.17 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.07.78 2.15v3.19c0 .31.21.67.8.55A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" /></svg>,

  Instagram: (p) =>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>,

  File: (p) =>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></svg>

};

/* ---------------- decorative squiggle ---------------- */

function Squiggle({ style }) {
  return (
    <img
      src="assets/scribble.png"
      alt=""
      aria-hidden="true"
      style={{
        position: "absolute",
        width: 300,
        height: "auto",
        pointerEvents: "none",
        opacity: 0.9,
        ...style
      }} />);


}

/* ---------------- placeholder media ---------------- */

function MediaThumb({ img, alt, fallback }) {
  if (img) return <img src={img} alt={alt} onError={(e) => {e.target.style.display = 'none';}} />;
  return (
    <div style={{
      width: "100%", height: "100%",
      background: fallback || "repeating-linear-gradient(135deg, #fbf8fc 0 12px, #f0e9f4 12px 24px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "rgb(107,93,117)",
      fontFamily: "Space Mono, monospace", fontSize: 13, letterSpacing: "-0.04em"
    }}>
      [ project shot ]
    </div>);

}

/* ---------------- Header ---------------- */

function Hamburger({ open, onClick }) {
  return (
    <button
      className="mobile-toggle"
      onClick={onClick}
      aria-label={open ? "Close menu" : "Open menu"}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {open ?
        <> <path d="M6 6l12 12" /><path d="M18 6L6 18" /> </> :
        <> <path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /> </>
        }
      </svg>
    </button>);
}

function MobileMenu({ open, onClose, onChat, onBack }) {
  return (
    <div className={`mobile-menu ${open ? "open" : ""}`}>
      {onBack ?
        <a href="#" onClick={(e) => {e.preventDefault();onBack();onClose();}}>← Back to portfolio</a> :
        <>
          <a href="#work" onClick={onClose}>Work</a>
          <a href="#about" onClick={onClose}>About</a>
        </>
      }
      <button className="btn-chat" onClick={() => {onClose();onChat && onChat();}}>
        {onBack ? "Close case study" : "Let's chat"}
      </button>
    </div>);
}

function Header({ onChat, active, menuOpen, setMenuOpen }) {
  return (
    <header className="header">
      <div className="brand">
        <span>anna volkova</span>
        <span className="rule" />
        <span className="role">designer</span>
      </div>
      <nav className="nav">
        <a href="#work" className={active === "work" ? "active" : ""}>Work</a>
        <a href="#about" className={active === "about" ? "active" : ""}>About</a>
        <button className="btn-chat" onClick={onChat}>Let's chat</button>
      </nav>
      <Hamburger open={menuOpen} onClick={() => setMenuOpen(!menuOpen)} />
    </header>);

}

/* ---------------- Hero ---------------- */

function Hero() {
  return (
    <section className="hero container" id="about" style={{ position: "relative" }}>
      <Squiggle style={{ top: 60, left: -90, width: 306, height: 238, opacity: 0.7, zIndex: 0 }} />
      <div className="hero-row">
        <div>
          <h1 className="serif">Anna Volkova — Designer based in Ljubljana</h1>
          <p className="lede">I design products, create visual content, code my way out of problems, and build things when inspiration strikes.</p>
          <div className="meta">
            {CHIPS.map((c) =>
            <div className="chip" key={c.k}>
                <div className="k">{c.k}</div>
                <div className="v">{c.v}</div>
              </div>
            )}
          </div>
        </div>
        <div className="cv-list">
          {CV.map((r) =>
          <div className="row" key={r.what}>
              <div className="when">{r.when}</div>
              <div className="what">{r.what}</div>
            </div>
          )}
        </div>
      </div>
    </section>);

}

/* ---------------- Projects ---------------- */

function ProjectCard({ p, reverse, onOpen }) {
  return (
    <article className={`project ${reverse ? "reverse" : ""}`}>
      {reverse ?
      <>
          <div className="project-body">
            <div className="tag"><span className="dot" /> {p.tag} <span style={{ color: "var(--muted-2)" }}>·</span> {p.status}</div>
            <h3>{p.subtitle}</h3>
            <p>{p.description}</p>
            <button className="read-more" onClick={() => onOpen(p.id)}>
              Read more <span className="arr">→</span>
            </button>
          </div>
          <div className="project-media" onClick={() => onOpen(p.id)}>
            <MediaThumb img={p.img} alt={p.title} />
            <span className="peek">Open case study →</span>
          </div>
        </> :

      <>
          <div className="project-media" onClick={() => onOpen(p.id)}>
            <MediaThumb img={p.img} alt={p.title} />
            <span className="peek">Open case study →</span>
          </div>
          <div className="project-body">
            <div className="tag"><span className="dot" /> {p.tag} <span style={{ color: "var(--muted-2)" }}>·</span> {p.status}</div>
            <h3>{p.subtitle}</h3>
            <p>{p.description}</p>
            <button className="read-more" onClick={() => onOpen(p.id)}>
              Read more <span className="arr">→</span>
            </button>
          </div>
        </>
      }
    </article>);

}

function Projects({ onOpen }) {
  return (
    <section className="container" id="work" style={{ paddingTop: 40 }}>
      <div className="label">Latest projects:</div>
      <div className="projects">
        {PROJECTS.map((p, i) =>
        <ProjectCard key={p.id} p={p} reverse={i % 2 === 1} onOpen={onOpen} />
        )}
      </div>
      <div className="more-btn-wrap">
        <button className="btn-ghost" onClick={() => alert("Full archive coming soon :) — ping me via Let's chat.")}>
          <Icon.Plus /> More client projects
        </button>
      </div>
    </section>);

}

/* ---------------- Fun grid ---------------- */

function FunGrid() {
  return (
    <section className="container" style={{ paddingBottom: 80 }}>
      <div className="label">Things I made for fun:</div>
      <div className="fun-grid">
        {FUN_THINGS.map((f, i) =>
        <div className="fun-card" key={f.title} onClick={() => alert(`"${f.title}" — coming soon.`)}>
            <div className="thumb" style={{ background: f.bg }}>
              <div style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", justifyContent: "flex-start",
              padding: 14, color: "rgba(21,2,34,.45)", fontFamily: "Space Mono, monospace", fontSize: 11, letterSpacing: "-0.04em"
            }}>
                [{String(i + 1).padStart(2, "0")}]
              </div>
            </div>
            <h4>{f.title}</h4>
            <div className={`status ${f.done ? "done" : ""}`}>{f.status}</div>
          </div>
        )}
      </div>
    </section>);

}

/* ---------------- CTA + Footer ---------------- */

function CTA({ onChat }) {
  return (
    <section className="container cta">
      <h2 className="serif">Building something cool?</h2>
      <div className="sub">Let's have a chat :)</div>
      <button className="btn-chat" onClick={onChat}>Let's chat <Icon.ArrowRight /></button>
    </section>);

}

function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-row">
        <div className="copy">Designed by Anna Volkova{"\n"}Copyright © 2026</div>
        <div className="links">
          <a className="pill" href="#" onClick={(e) => {e.preventDefault();alert("Resume — download placeholder");}}>
            <Icon.File style={{ width: 16, height: 16 }} /> Resume
          </a>
          <a className="pill" href="#" aria-label="Instagram" onClick={(e) => e.preventDefault()}><Icon.Instagram style={{ width: 20, height: 20 }} /></a>
          <a className="pill" href="#" aria-label="GitHub" onClick={(e) => e.preventDefault()}><Icon.Github style={{ width: 20, height: 20 }} /></a>
          <a className="pill" href="#" aria-label="Email" onClick={(e) => e.preventDefault()}><Icon.Mail style={{ width: 20, height: 20 }} /></a>
        </div>
      </div>
    </footer>);

}

/* ---------------- Case study ---------------- */

function CaseStudy({ project, open, onClose }) {
  const mainRef = useRef(null);
  const [activeSection, setActiveSection] = useState("overview");
  const [caseMenuOpen, setCaseMenuOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const el = mainRef.current;
    if (!el) return;
    el.scrollTop = 0;
    setActiveSection("overview");

    const observer = new IntersectionObserver(
      (entries) => {
        // find entry whose top is nearest to (but below) the top of the viewport
        const visible = entries.
        filter((e) => e.isIntersecting).
        sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length) setActiveSection(visible[0].target.id);
      },
      { root: el, rootMargin: "-15% 0px -60% 0px", threshold: 0 }
    );
    CASE_SECTIONS.forEach((s) => {
      const node = el.querySelector(`#case-${s.id}`);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [open, project]);

  if (!project) return null;

  const scrollTo = (id) => {
    const el = mainRef.current?.querySelector(`#case-${id}`);
    if (el) el.scrollIntoView ? null : null;
    // Manual scroll within overlay to avoid page scroll issues
    if (el && mainRef.current) {
      const top = el.offsetTop - 40;
      mainRef.current.scrollTo({ top, behavior: "smooth" });
    }
  };

  return (
    <div className={`case-overlay ${open ? "open" : ""}`} ref={mainRef}>
      <header className="header">
        <div className="brand">
          <span>anna volkova</span>
          <span className="rule" />
          <span className="role">designer</span>
        </div>
        <nav className="nav">
          <a href="#" onClick={(e) => {e.preventDefault();onClose();}}>Work</a>
          <a href="#" onClick={(e) => {e.preventDefault();onClose();}}>About</a>
          <button className="btn-chat" onClick={onClose}>Back</button>
        </nav>
        <Hamburger open={caseMenuOpen} onClick={() => setCaseMenuOpen(!caseMenuOpen)} />
      </header>
      <MobileMenu open={caseMenuOpen} onClose={() => setCaseMenuOpen(false)} onBack={onClose} />
      <div className="case-layout">
        <aside className="case-sidebar">
          <button className="back" onClick={onClose}>← Back</button>
          <nav>
            {CASE_SECTIONS.map((s) =>
            <a
              key={s.id}
              href={`#case-${s.id}`}
              className={activeSection === s.id ? "active" : ""}
              onClick={(e) => {e.preventDefault();scrollTo(s.id);}}>
              
                <span className="bullet" /> {s.label}
              </a>
            )}
          </nav>
        </aside>
        <main className="case-main">
          <div className="case-tag">{project.tag} | {project.status}</div>
          <h1 className="case-title">{project.title}</h1>

          <div className="hero-img">
            {project.img ?
            <img src={project.img} alt={project.title} /> :
            <div style={{ aspectRatio: "816/360", background: "repeating-linear-gradient(135deg, #fbf8fc 0 12px, #f0e9f4 12px 24px)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontFamily: "Space Mono, monospace", fontSize: 13 }}>[ hero shot ]</div>}
          </div>

          <div className="meta-row">
            {Object.entries(project.meta).map(([k, v]) =>
            <div className="cell" key={k}>
                <div className="k">{k}</div>
                <div className="v">{v}</div>
              </div>
            )}
          </div>

          <section id="case-overview" className="case-section">
            <div className="kicker">Overview</div>
            <h2>What if there was a way to show your recently listened tracks &amp; albums on your Notion page?</h2>
            <p>If you're not a very specific kind of nerd, you've probably never asked yourself that question. Unfortunately, I am this very specific kind of nerd; I love music and I love stats and I love a cute Notion homepage. This led me to scour the internet for a last.fm widget created specifically for Notion, and I couldn't find anything!</p>
          </section>

          <section id="case-problem" className="case-section">
            <div className="kicker">Problem</div>
            <h2>Existing embeds feel like iframes, not like Notion.</h2>
            <p>Notion users live in a small set of clean, deliberately quiet components — toggles, callouts, databases. Every last.fm embed I tried either looked like a Spotify console, overflowed the column, or didn't respect dark-mode. <strong>None of them felt native.</strong></p>
            <div className="stats">
              <div className="stat"><div className="n">17</div><div className="l">existing embeds reviewed</div></div>
              <div className="stat"><div className="n">0</div><div className="l">that respected Notion's grid</div></div>
              <div className="stat"><div className="n">3</div><div className="l">column widths a widget must support</div></div>
            </div>
          </section>

          <section id="case-process" className="case-section">
            <div className="kicker">Design Process</div>
            <h2>Two days, four iterations, one stubborn grid.</h2>
            <p>I gave myself a weekend. That forced the scope into something useful: one widget, two views (Chart / Recent Tracks), three responsive widths.</p>
            <div className="process-steps">
              <div className="step"><div className="num">01 / Audit</div><h4>Map the Notion visual language</h4><p>Sampled 20 public templates to catalogue radius, type, density, and how embeds sit in a column.</p></div>
              <div className="step"><div className="num">02 / Sketch</div><h4>Three layouts, one winner</h4><p>Covers-grid, list, and a hybrid. Covers won on information density per pixel.</p></div>
              <div className="step"><div className="num">03 / Build</div><h4>Vanilla JS + last.fm API</h4><p>Single HTML file that reads <code>?user=</code> and renders without a backend.</p></div>
              <div className="step"><div className="num">04 / Polish</div><h4>Respect the container</h4><p>Fluid grid collapses to 4, 5, or 6 columns depending on the Notion column width.</p></div>
            </div>
          </section>

          <section id="case-solution" className="case-section">
            <div className="kicker">Solution</div>
            <h2>A widget that dynamically presents your last.fm stats, optimised to your Notion dashboard layout.</h2>
            <p>It ships as a single embeddable URL. Paste, pick a username, done. Two modes — Chart and Recent Tracks — and totals for Artists / Albums / Tracks that feel like they were typeset for the page they sit on.</p>
          </section>

          <section id="case-outcome" className="case-section">
            <div className="kicker">Outcome</div>
            <h2>A tiny tool a few thousand people ended up using.</h2>
            <div className="stats">
              <div className="stat"><div className="n">2k+</div><div className="l">active widgets in the wild</div></div>
              <div className="stat"><div className="n">4.8</div><div className="l">average self-reported rating</div></div>
              <div className="stat"><div className="n">&lt;1s</div><div className="l">median time-to-first-cover</div></div>
            </div>
          </section>

          <section id="case-insights" className="case-section">
            <div className="kicker">Insights</div>
            <h2>What I'd do differently next time.</h2>
            <p><strong>Start from the container, not the data.</strong> The widget only felt right once I designed for the three real column widths in Notion and stopped trying to make one layout fit all. The data was easy; the grid was the whole project.</p>
            <p><strong>Ship the boring flag.</strong> The biggest feedback request wasn't a feature — it was a dark-mode toggle. I shipped v1 without one because I assumed Notion's system would handle it. It doesn't, for iframes. Lesson: embeds need their own theme contract.</p>
          </section>
        </main>
      </div>
    </div>);

}

/* ---------------- Chat modal ---------------- */

const REASONS = ["New project", "Full-time role", "Freelance gig", "Just saying hi"];

function ChatModal({ open, onClose }) {
  const [reason, setReason] = useState("New project");
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (open) {setSent(false);}
  }, [open]);

  useEffect(() => {
    const h = (e) => {if (e.key === "Escape") onClose();};
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const submit = (e) => {
    e.preventDefault();
    if (!form.name || !form.email) return;
    setSent(true);
  };

  return (
    <>
      <div className={`modal-backdrop ${open ? "open" : ""}`} onClick={onClose} />
      <div className={`modal ${open ? "open" : ""}`} role="dialog" aria-modal="true">
        {!sent ?
        <form onSubmit={submit}>
            <h3 className="serif">Let's chat</h3>
            <div className="sub">I read every message. Usually reply within a day.</div>

            <div className="reasons">
              {REASONS.map((r) =>
            <button key={r} type="button" className={`reason ${reason === r ? "on" : ""}`} onClick={() => setReason(r)}>{r}</button>
            )}
            </div>

            <div className="field">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" required />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@somewhere.com" required />
            </div>
            <div className="field">
              <label>Message</label>
              <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="What are you building?" />
            </div>

            <div className="actions">
              <button type="button" className="close" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn-chat" style={{ height: 40 }}>Send <Icon.ArrowRight /></button>
            </div>
          </form> :

        <div className="sent">
            <div className="tick">✓</div>
            <h3 className="serif" style={{ marginBottom: 8 }}>Got it — thank you!</h3>
            <div className="sub" style={{ marginBottom: 20 }}>I'll get back to you soon. In the meantime, enjoy the rest of the portfolio.</div>
            <button className="btn-chat" onClick={onClose}>Close</button>
          </div>
        }
      </div>
    </>);

}

/* ---------------- Tweaks (host-integrated) ---------------- */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "lavender",
  "chatOpenByDefault": false
} /*EDITMODE-END*/;

const ACCENTS = {
  lavender: { swatch: "oklch(0.55 0.09 310)", value: "oklch(0.55 0.09 310)" },
  teal: { swatch: "oklch(0.55 0.09 190)", value: "oklch(0.55 0.09 190)" },
  peach: { swatch: "oklch(0.70 0.12 50)", value: "oklch(0.65 0.11 45)" },
  forest: { swatch: "oklch(0.50 0.09 150)", value: "oklch(0.50 0.09 150)" }
};

function Tweaks({ show, values, setValues }) {
  return (
    <div className={`tweaks ${show ? "show" : ""}`}>
      <div className="t-title">Tweaks</div>
      <div className="t-row">
        <span>Accent</span>
        <div className="swatches">
          {Object.entries(ACCENTS).map(([k, v]) =>
          <div
            key={k}
            className={`swatch ${values.accent === k ? "on" : ""}`}
            style={{ background: v.swatch }}
            title={k}
            onClick={() => setValues({ accent: k })} />

          )}
        </div>
      </div>
    </div>);

}

/* ---------------- App ---------------- */

function App() {
  const [openProject, setOpenProject] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tweaksOn, setTweaksOn] = useState(false);
  const [tweakValues, setTweakValuesRaw] = useState(TWEAK_DEFAULTS);

  const setTweakValues = (patch) => {
    const next = { ...tweakValues, ...patch };
    setTweakValuesRaw(next);
    try {
      window.parent.postMessage({ type: "__edit_mode_set_keys", edits: patch }, "*");
    } catch {}
  };

  // apply accent to CSS var
  useEffect(() => {
    const a = ACCENTS[tweakValues.accent] || ACCENTS.lavender;
    document.documentElement.style.setProperty("--accent", a.value);
  }, [tweakValues.accent]);

  // edit mode protocol
  useEffect(() => {
    const handler = (e) => {
      const d = e.data || {};
      if (d.type === "__activate_edit_mode") setTweaksOn(true);
      if (d.type === "__deactivate_edit_mode") setTweaksOn(false);
    };
    window.addEventListener("message", handler);
    try {window.parent.postMessage({ type: "__edit_mode_available" }, "*");} catch {}
    return () => window.removeEventListener("message", handler);
  }, []);

  // scroll spy for header nav
  const [activeSec, setActiveSec] = useState("about");
  useEffect(() => {
    const targets = ["about", "work"].map((id) => document.getElementById(id)).filter(Boolean);
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {if (e.isIntersecting) setActiveSec(e.target.id);});
    }, { rootMargin: "-40% 0px -50% 0px" });
    targets.forEach((t) => obs.observe(t));
    return () => obs.disconnect();
  }, []);

  // persist openProject across reload
  useEffect(() => {
    const p = localStorage.getItem("openProject");
    if (p) {
      const proj = PROJECTS.find((x) => x.id === p);
      if (proj) setOpenProject(proj);
    }
  }, []);
  useEffect(() => {
    if (openProject) localStorage.setItem("openProject", openProject.id);else
    localStorage.removeItem("openProject");
  }, [openProject]);

  // lock body scroll when overlay open
  useEffect(() => {
    document.body.style.overflow = openProject || chatOpen || menuOpen ? "hidden" : "";
  }, [openProject, chatOpen, menuOpen]);

  // close menu on resize to desktop / escape
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 640) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const openCase = (id) => {
    const p = PROJECTS.find((x) => x.id === id);
    if (p) setOpenProject(p);
  };

  return (
    <>
      <div className="page">
        <Header onChat={() => setChatOpen(true)} active={activeSec} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
        <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} onChat={() => setChatOpen(true)} />
        <Hero />
        <Projects onOpen={openCase} />
        <FunGrid />
        <CTA onChat={() => setChatOpen(true)} />
        <Footer />
      </div>
      <CaseStudy project={openProject} open={!!openProject} onClose={() => setOpenProject(null)} />
      <ChatModal open={chatOpen} onClose={() => setChatOpen(false)} />
      <Tweaks show={tweaksOn} values={tweakValues} setValues={setTweakValues} />
    </>);

}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);