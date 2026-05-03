// Tab content components for the Terminal app
// Three original tabs: Coder (AI coding assistant), HTOP (process monitor), Netgraph (traffic)

const MONO = '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Consolas, monospace';

// ────────────────────────────────────────────────────────────────
// Shared primitives
// ────────────────────────────────────────────────────────────────
function Line({ children, color, dim, bold, indent = 0, style = {} }) {
  return (
    <div style={{
      whiteSpace: 'pre-wrap',
      color: color || (dim ? 'var(--fg-dim)' : 'var(--fg)'),
      fontWeight: bold ? 600 : 400,
      paddingLeft: indent * 12,
      lineHeight: 1.55,
      ...style,
    }}>{children}</div>
  );
}

function Cursor({ blink = true }) {
  return <span className={blink ? 'tcursor' : ''} style={{
    display: 'inline-block', width: '0.55em', height: '1.05em',
    background: 'var(--accent)', verticalAlign: '-2px', marginLeft: 2,
  }} />;
}

// ────────────────────────────────────────────────────────────────
// 1. CODER — original AI coding assistant
// ────────────────────────────────────────────────────────────────
function CoderTab() {
  const [history, setHistory] = React.useState([
    { kind: 'banner' },
    { kind: 'user', text: 'find the bug in auth/session.ts that lets expired tokens through' },
    { kind: 'thinking', text: 'reading auth/session.ts · 142 lines' },
    { kind: 'tool', name: 'read', target: 'auth/session.ts', meta: 'L1–142' },
    { kind: 'tool', name: 'grep', target: 'expiresAt', meta: '4 matches' },
    { kind: 'assistant', text: 'Found it. `validateSession()` compares `expiresAt` against `Date.now()` but the timestamp is stored in seconds while `Date.now()` returns ms — so a token that expired ~16 minutes ago still passes for ~16,000 minutes.' },
    { kind: 'diff', file: 'auth/session.ts', plus: 1, minus: 1, lines: [
      { type: 'ctx', n: 47, text: '  const now = Date.now();' },
      { type: 'minus', n: 48, text: '  if (session.expiresAt < now) return null;' },
      { type: 'plus',  n: 48, text: '  if (session.expiresAt * 1000 < now) return null;' },
      { type: 'ctx', n: 49, text: '  return session;' },
    ]},
    { kind: 'assistant', text: 'Want me to apply the patch and add a regression test?' },
    { kind: 'user', text: 'yes, apply it' },
    { kind: 'tool', name: 'edit', target: 'auth/session.ts', meta: '+1 −1' },
    { kind: 'tool', name: 'write', target: 'auth/session.test.ts', meta: '+34' },
    { kind: 'tool', name: 'run', target: 'pnpm test auth', meta: '✓ 8 passed' },
    { kind: 'success', text: 'Patch applied · all auth tests green · 1.3s' },
  ]);
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history, busy]);

  const submit = async (e) => {
    e.preventDefault();
    const q = input.trim();
    if (!q || busy) return;
    setInput('');
    setHistory(h => [...h, { kind: 'user', text: q }]);
    setBusy(true);
    try {
      const reply = await window.claude.complete(
        `You are a terse senior engineer in a coding-assistant CLI. Reply in 1-3 short sentences, technical, lowercase-leaning, no fluff. User: ${q}`
      );
      setHistory(h => [...h, { kind: 'assistant', text: reply.trim() }]);
    } catch {
      setHistory(h => [...h, { kind: 'assistant', text: '(offline) i would suggest running the test suite first to surface the failure.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: MONO, fontSize: 13 }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 8px' }}>
        {history.map((m, i) => <CoderMsg key={i} m={m} />)}
        {busy && <Line color="var(--accent)" style={{ marginTop: 6 }}>● thinking<span className="tcursor-dots" /></Line>}
      </div>
      <form onSubmit={submit} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 28px 18px', borderTop: '1px solid var(--border)',
      }}>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>›</span>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={busy ? '' : 'ask, edit, or describe a change…'}
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--fg)', fontFamily: MONO, fontSize: 13, caretColor: 'var(--accent)',
          }}
        />
        <span style={{ color: 'var(--fg-dim)', fontSize: 11 }}>⏎ send</span>
      </form>
    </div>
  );
}

function CoderMsg({ m }) {
  if (m.kind === 'banner') {
    return (
      <div style={{ marginBottom: 18, color: 'var(--fg-dim)' }}>
        <Line color="var(--accent)" bold>coder · v0.4.2</Line>
        <Line dim>workspace: ~/projects/orbit-api  ·  branch: main  ·  model: sonnet-class</Line>
        <Line dim style={{ marginTop: 4 }}>type a request, paste an error, or drop a file path. /help for commands.</Line>
      </div>
    );
  }
  if (m.kind === 'user') {
    return (
      <div style={{ margin: '14px 0 8px' }}>
        <Line color="var(--accent2)"><span style={{ opacity: 0.6 }}>›</span> {m.text}</Line>
      </div>
    );
  }
  if (m.kind === 'thinking') {
    return <Line dim style={{ margin: '4px 0' }}>· {m.text}</Line>;
  }
  if (m.kind === 'tool') {
    const sym = { read: '⌕', grep: '⌕', edit: '✎', write: '＋', run: '▸' }[m.name] || '·';
    return (
      <div style={{ margin: '2px 0', display: 'flex', gap: 10 }}>
        <span style={{ color: 'var(--accent)', width: 14 }}>{sym}</span>
        <span style={{ color: 'var(--fg-dim)' }}>{m.name}</span>
        <span style={{ color: 'var(--fg)' }}>{m.target}</span>
        <span style={{ color: 'var(--fg-dim)', marginLeft: 'auto' }}>{m.meta}</span>
      </div>
    );
  }
  if (m.kind === 'assistant') {
    return (
      <div style={{ margin: '8px 0', maxWidth: 720 }}>
        <Line>{m.text}</Line>
      </div>
    );
  }
  if (m.kind === 'diff') {
    return (
      <div style={{
        margin: '8px 0', border: '1px solid var(--border)', borderRadius: 4,
        background: 'var(--bg-soft)', overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '6px 12px', borderBottom: '1px solid var(--border)',
          color: 'var(--fg-dim)', fontSize: 12,
        }}>
          <span>{m.file}</span>
          <span><span style={{ color: 'var(--ok)' }}>+{m.plus}</span> <span style={{ color: 'var(--err)' }}>−{m.minus}</span></span>
        </div>
        {m.lines.map((l, i) => (
          <div key={i} style={{
            display: 'flex', padding: '0 12px',
            background: l.type === 'plus' ? 'rgba(120,200,140,0.08)' : l.type === 'minus' ? 'rgba(220,120,120,0.08)' : 'transparent',
            color: l.type === 'plus' ? 'var(--ok)' : l.type === 'minus' ? 'var(--err)' : 'var(--fg)',
            fontSize: 12.5, lineHeight: 1.7,
          }}>
            <span style={{ width: 32, color: 'var(--fg-dim)', textAlign: 'right', paddingRight: 12 }}>{l.n}</span>
            <span style={{ width: 14, color: 'var(--fg-dim)' }}>
              {l.type === 'plus' ? '+' : l.type === 'minus' ? '−' : ' '}
            </span>
            <span style={{ whiteSpace: 'pre' }}>{l.text}</span>
          </div>
        ))}
      </div>
    );
  }
  if (m.kind === 'success') {
    return <Line color="var(--ok)" style={{ margin: '6px 0' }}>✓ {m.text}</Line>;
  }
  return null;
}

// ────────────────────────────────────────────────────────────────
// 2. HTOP — process monitor
// ────────────────────────────────────────────────────────────────
function HtopTab() {
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1100);
    return () => clearInterval(id);
  }, []);

  // deterministic pseudo-randomness based on tick
  const wob = (seed, range = 1) => {
    const x = Math.sin(tick * 0.7 + seed * 12.9898) * 43758.5453;
    return ((x - Math.floor(x)) - 0.5) * 2 * range;
  };

  const cores = [
    { n: 1, base: 42 }, { n: 2, base: 28 }, { n: 3, base: 71 }, { n: 4, base: 19 },
    { n: 5, base: 88 }, { n: 6, base: 35 }, { n: 7, base: 52 }, { n: 8, base: 8 },
  ].map(c => ({ ...c, val: clamp(c.base + wob(c.n, 12), 2, 99) }));

  const memUsed = clamp(11.4 + wob(99, 0.4), 8, 15);
  const swap = clamp(0.8 + wob(88, 0.2), 0, 4);

  const procs = [
    { pid: 4821, user: 'maya', cpu: 38 + wob(1, 8), mem: 4.2, time: '2:14:09', cmd: 'node server.js' },
    { pid: 9203, user: 'maya', cpu: 22 + wob(2, 6), mem: 2.8, time: '0:48:31', cmd: 'webpack --watch' },
    { pid: 1147, user: 'root', cpu: 14 + wob(3, 4), mem: 1.1, time: '6d 2:11', cmd: '/usr/sbin/sshd -D' },
    { pid: 6612, user: 'maya', cpu: 9 + wob(4, 3), mem: 3.4, time: '0:12:08', cmd: 'rg --files src/' },
    { pid: 2204, user: 'maya', cpu: 7 + wob(5, 2), mem: 0.9, time: '4:02:55', cmd: 'tmux: server' },
    { pid: 8801, user: 'maya', cpu: 4 + wob(6, 2), mem: 5.6, time: '1:33:20', cmd: 'chrome --type=renderer' },
    { pid: 3340, user: 'postgres', cpu: 2 + wob(7, 1), mem: 1.8, time: '11:08:42', cmd: 'postgres: writer' },
    { pid: 7712, user: 'maya', cpu: 1 + wob(8, 1), mem: 0.4, time: '0:00:31', cmd: 'htop' },
    { pid: 5588, user: 'maya', cpu: 0.7, mem: 0.3, time: '2d 1:04', cmd: 'fish' },
  ].map(p => ({ ...p, cpu: clamp(p.cpu, 0, 99) }))
   .sort((a, b) => b.cpu - a.cpu);

  return (
    <div style={{ fontFamily: MONO, fontSize: 12.5, padding: '16px 22px', height: '100%', overflowY: 'auto' }}>
      {/* CPU cores */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 28px', marginBottom: 12 }}>
        {cores.map(c => <Bar key={c.n} label={String(c.n).padStart(2, ' ')} pct={c.val} />)}
      </div>
      {/* Mem & Swap */}
      <div style={{ marginBottom: 4 }}>
        <Bar label="Mem" pct={(memUsed / 16) * 100} suffix={`${memUsed.toFixed(1)}G/16.0G`} hue="mem" />
      </div>
      <div style={{ marginBottom: 14 }}>
        <Bar label="Swp" pct={(swap / 4) * 100} suffix={`${swap.toFixed(1)}G/4.0G`} hue="swap" />
      </div>
      {/* meta */}
      <div style={{ display: 'flex', gap: 24, color: 'var(--fg-dim)', marginBottom: 12, flexWrap: 'wrap' }}>
        <span>Tasks: <span style={{ color: 'var(--fg)' }}>184</span>, 312 thr; <span style={{ color: 'var(--ok)' }}>2 running</span></span>
        <span>Load avg: <span style={{ color: 'var(--fg)' }}>1.84 1.62 1.40</span></span>
        <span>Uptime: <span style={{ color: 'var(--fg)' }}>14 days, 03:22:18</span></span>
      </div>

      {/* table */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '70px 90px 70px 70px 90px 1fr',
        background: 'var(--accent)', color: 'var(--bg)',
        padding: '2px 6px', fontWeight: 600, marginBottom: 4,
      }}>
        <span>  PID</span><span>USER</span><span style={{ textAlign: 'right' }}>CPU%</span>
        <span style={{ textAlign: 'right' }}>MEM%</span><span style={{ textAlign: 'right', paddingRight: 16 }}>TIME+</span>
        <span>Command</span>
      </div>
      {procs.map((p, i) => (
        <div key={p.pid} style={{
          display: 'grid',
          gridTemplateColumns: '70px 90px 70px 70px 90px 1fr',
          padding: '1px 6px',
          color: i === 0 ? 'var(--fg)' : 'var(--fg)',
          background: i === 0 ? 'rgba(180,160,90,0.08)' : 'transparent',
        }}>
          <span style={{ color: 'var(--fg-dim)' }}>{p.pid}</span>
          <span style={{ color: p.user === 'root' ? 'var(--err)' : 'var(--fg-dim)' }}>{p.user}</span>
          <span style={{ textAlign: 'right', color: p.cpu > 30 ? 'var(--accent)' : 'var(--fg)' }}>{p.cpu.toFixed(1)}</span>
          <span style={{ textAlign: 'right' }}>{p.mem.toFixed(1)}</span>
          <span style={{ textAlign: 'right', paddingRight: 16, color: 'var(--fg-dim)' }}>{p.time}</span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.cmd}</span>
        </div>
      ))}

      <div style={{
        marginTop: 18, paddingTop: 10, borderTop: '1px solid var(--border)',
        display: 'flex', gap: 18, color: 'var(--fg-dim)', flexWrap: 'wrap', fontSize: 11.5,
      }}>
        {[['F1','Help'],['F2','Setup'],['F3','Search'],['F4','Filter'],['F5','Tree'],['F6','SortBy'],['F9','Kill'],['F10','Quit']]
          .map(([k, v]) => (
            <span key={k}><span style={{ color: 'var(--fg)' }}>{k}</span> {v}</span>
          ))}
      </div>
    </div>
  );
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function Bar({ label, pct, suffix, hue }) {
  pct = clamp(pct, 0, 100);
  const width = 220;
  const filled = Math.round((pct / 100) * width);
  const color = hue === 'mem' ? 'var(--accent2)'
              : hue === 'swap' ? 'var(--err)'
              : pct > 75 ? 'var(--err)'
              : pct > 45 ? 'var(--accent)'
              : 'var(--ok)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg)' }}>
      <span style={{ color: 'var(--fg-dim)', width: 28 }}>{label}</span>
      <span style={{ color: 'var(--fg-dim)' }}>[</span>
      <div style={{ width, height: 10, position: 'relative', background: 'var(--bg-soft)' }}>
        <div style={{ position: 'absolute', inset: 0, width: filled, background: color }} />
      </div>
      <span style={{ color: 'var(--fg-dim)' }}>]</span>
      <span style={{ color: 'var(--fg-dim)', fontSize: 11.5 }}>
        {suffix || `${pct.toFixed(1)}%`}
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// 3. NETGRAPH — network traffic viz
// ────────────────────────────────────────────────────────────────
function NetgraphTab() {
  const W = 80; // columns
  const H = 18; // rows
  const [series, setSeries] = React.useState(() => {
    const a = [];
    for (let i = 0; i < W; i++) {
      a.push({
        rx: 30 + Math.sin(i * 0.3) * 18 + Math.random() * 8,
        tx: 22 + Math.cos(i * 0.25) * 14 + Math.random() * 6,
      });
    }
    return a;
  });

  React.useEffect(() => {
    const id = setInterval(() => {
      setSeries(s => {
        const last = s[s.length - 1];
        const t = Date.now() / 1000;
        const rx = clamp(last.rx + (Math.sin(t) * 4 + (Math.random() - 0.5) * 14), 4, 95);
        const tx = clamp(last.tx + (Math.cos(t * 1.3) * 3 + (Math.random() - 0.5) * 11), 2, 80);
        return [...s.slice(1), { rx, tx }];
      });
    }, 250);
    return () => clearInterval(id);
  }, []);

  const max = 100;
  const blocks = ['▁','▂','▃','▄','▅','▆','▇','█'];

  // build grid: top half rx (filled blocks), bottom half tx (mirrored)
  const rxRows = []; // top -> bottom
  for (let r = 0; r < H; r++) {
    let row = '';
    const threshold = max * (1 - r / H);
    for (let c = 0; c < W; c++) {
      row += series[c].rx >= threshold ? '█' : ' ';
    }
    rxRows.push(row);
  }
  const txRows = [];
  for (let r = 0; r < H; r++) {
    let row = '';
    const threshold = max * ((r + 1) / H);
    for (let c = 0; c < W; c++) {
      row += series[c].tx >= threshold ? '█' : ' ';
    }
    txRows.push(row);
  }

  const lastRx = series[series.length - 1].rx;
  const lastTx = series[series.length - 1].tx;
  const avgRx = series.reduce((s, p) => s + p.rx, 0) / series.length;
  const avgTx = series.reduce((s, p) => s + p.tx, 0) / series.length;

  return (
    <div style={{ fontFamily: MONO, fontSize: 12, padding: '16px 22px', height: '100%', overflowY: 'auto' }}>
      <div style={{ display: 'flex', gap: 28, marginBottom: 14, flexWrap: 'wrap' }}>
        <Stat label="iface"  val="en0" />
        <Stat label="rx"     val={`${lastRx.toFixed(1)} Mbit/s`} color="var(--accent)" />
        <Stat label="tx"     val={`${lastTx.toFixed(1)} Mbit/s`} color="var(--accent2)" />
        <Stat label="avg rx" val={`${avgRx.toFixed(1)}`} />
        <Stat label="avg tx" val={`${avgTx.toFixed(1)}`} />
        <Stat label="peer"   val="184 conns" />
      </div>

      <div style={{ position: 'relative', display: 'flex' }}>
        <YAxis max={100} rows={H} />
        <div style={{ flex: 1 }}>
          {/* RX (incoming) — solid accent */}
          <pre style={{
            margin: 0, lineHeight: 1, color: 'var(--accent)',
            fontFamily: MONO, fontSize: 11, letterSpacing: 0.5,
          }}>{rxRows.join('\n')}</pre>
          {/* axis */}
          <div style={{ borderTop: '1px dashed var(--border)', margin: '4px 0', position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 8, top: -8, background: 'var(--bg)',
              padding: '0 6px', color: 'var(--fg-dim)', fontSize: 10,
            }}>rx ↑   tx ↓</span>
          </div>
          <pre style={{
            margin: 0, lineHeight: 1, color: 'var(--accent2)',
            fontFamily: MONO, fontSize: 11, letterSpacing: 0.5,
          }}>{txRows.join('\n')}</pre>
        </div>
      </div>

      {/* x-axis label */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        color: 'var(--fg-dim)', fontSize: 10.5, marginTop: 8,
        paddingLeft: 56,
      }}>
        <span>−20s</span><span>−15s</span><span>−10s</span><span>−5s</span><span>now</span>
      </div>

      {/* connection list */}
      <div style={{ marginTop: 22 }}>
        <div style={{ color: 'var(--fg-dim)', marginBottom: 6 }}>top connections</div>
        {[
          ['10.0.0.42:55124', 'api.orbit.dev:443',     '14.2 Mbit', 'ESTABLISHED'],
          ['10.0.0.42:51008', 'cdn.fastly.net:443',     '8.7 Mbit', 'ESTABLISHED'],
          ['10.0.0.42:62114', 'github.com:22',          '2.1 Mbit', 'ESTABLISHED'],
          ['10.0.0.42:54422', 'registry.npmjs.org:443', '0.9 Mbit', 'TIME_WAIT'],
          ['10.0.0.42:49011', '192.168.1.1:53',         '0.1 Mbit', 'UDP'],
        ].map((r, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '180px 220px 100px 1fr',
            gap: 12, padding: '2px 0', color: 'var(--fg)',
          }}>
            <span style={{ color: 'var(--fg-dim)' }}>{r[0]}</span>
            <span>{r[1]}</span>
            <span style={{ textAlign: 'right', color: 'var(--accent)' }}>{r[2]}</span>
            <span style={{ color: r[3] === 'ESTABLISHED' ? 'var(--ok)' : 'var(--fg-dim)' }}>{r[3]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function YAxis({ max, rows }) {
  const labels = [];
  for (let r = 0; r < rows; r++) {
    if (r % 4 === 0) labels.push(Math.round(max * (1 - r / rows)));
    else labels.push('');
  }
  return (
    <div style={{
      width: 48, paddingRight: 8, textAlign: 'right',
      color: 'var(--fg-dim)', fontSize: 10.5, lineHeight: 1,
      fontFamily: MONO,
    }}>
      {labels.map((l, i) => (
        <div key={i} style={{ height: 11 }}>{l !== '' ? `${l} ─` : ''}</div>
      ))}
    </div>
  );
}

function Stat({ label, val, color }) {
  return (
    <div>
      <div style={{ color: 'var(--fg-dim)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: color || 'var(--fg)', fontSize: 14, fontWeight: 500 }}>{val}</div>
    </div>
  );
}

Object.assign(window, { CoderTab, HtopTab, NetgraphTab });
