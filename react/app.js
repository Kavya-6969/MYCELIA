const { useState, useEffect, useMemo, useRef, useCallback } = React;
const ICONS = {
  PanelLeft: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
  PanelRight: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16"/>',
  Share2: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  Plus: '<path d="M12 5v14M5 12h14"/>',
  Minus: '<path d="M5 12h14"/>',
  Layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12.5 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  Sparkles: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15v4M17 17h4M5 3v3M3.5 4.5h3"/>',
  Download: '<path d="M12 4v11M7 10l5 5 5-5M5 19h14"/>',
  Link2: '<path d="M9 17H7a5 5 0 0 1 0-10h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/>',
  BookMarked: '<path d="M5 4a2 2 0 0 1 2-2h12v16H7a2 2 0 0 0-2 2z"/><path d="M5 20a2 2 0 0 0 2 2h12v-4"/><path d="M10 2v7l2-1.5L14 9V2"/>',
  Clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  Search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  FileText: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  Database: '<ellipse cx="12" cy="5.5" rx="7" ry="2.5"/><path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
  Code2: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  FlaskConical: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
  Brain: '<path d="M12 5a3 3 0 0 0-5.8-1A3 3 0 0 0 4 9a3.5 3.5 0 0 0 .5 6A3 3 0 0 0 9 19a3 3 0 0 0 3 2z"/><path d="M12 5a3 3 0 0 1 5.8-1A3 3 0 0 1 20 9a3.5 3.5 0 0 1-.5 6A3 3 0 0 1 15 19a3 3 0 0 1-3 2zM12 5v16"/>',
  ShieldCheck: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  ShieldAlert: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="M12 8v4M12 16h.01"/>',
  Terminal: '<path d="m5 8 4 4-4 4M12 17h7"/><rect x="2.5" y="4" width="19" height="16" rx="2.5"/>',
  History: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 4v4.5H8M12 8v4.5l3 1.7"/>',
  Maximize2: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  X: '<path d="M6 6l12 12M18 6 6 18"/>',
  SkipBack: '<path d="M19 5v14L9 12zM5 5v14"/>',
  SkipForward: '<path d="M5 5v14l10-7zM19 5v14"/>',
  ChevronLeft: '<path d="m15 6-6 6 6 6"/>',
  ChevronRight: '<path d="m9 6 6 6-6 6"/>',
  ChevronDown: '<path d="m6 9 6 6 6-6"/>',
  Play: '<path d="m7 4 13 8-13 8z"/>',
  Pause: '<path d="M8 5v14M16 5v14"/>',
  Star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  BookOpen: '<path d="M12 7c-1.5-1.5-4-2-8-2v13c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2V5c-4 0-6.5.5-8 2zM12 7v13"/>',
  Check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  CheckCircle2: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  XCircle: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  Bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 13v2M15 13v2"/><circle cx="12" cy="3.5" r="1"/>',
  Copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'
};
const Ic = ({ n, size = 16, className = "" }) => /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round", strokeLinejoin: "round", className, "aria-hidden": "true", "data-i": n, dangerouslySetInnerHTML: { __html: ICONS[n] || "" } });
const SPEED = window.__RG_SPEED || 1;
const W = 232;
const TYPES = {
  paper: { label: "Paper", icon: "FileText", badge: "bg-indigo-500/10 text-indigo-300 ring-indigo-500/30", color: "#818cf8" },
  dataset: { label: "Dataset", icon: "Database", badge: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30", color: "#34d399" },
  code: { label: "Code", icon: "Code2", badge: "bg-sky-500/10 text-sky-300 ring-sky-500/30", color: "#38bdf8" },
  experiment: { label: "Experiment", icon: "FlaskConical", badge: "bg-rose-500/10 text-rose-300 ring-rose-500/30", color: "#fb7185" },
  thought: { label: "Agent Thought", icon: "Brain", badge: "bg-amber-500/10 text-amber-300 ring-amber-500/30", color: "#fbbf24" }
};
const TAGS = ["Transformers", "Datasets", "Optimization", "AgentThought"];
const COLS = ["dataset", "paper", "code", "experiment", "thought"];
const nodeH = (n) => n.ai ? 156 : n.type === "experiment" ? 132 : 98;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function predict(p) {
  const best = 3e-4 * Math.sqrt(p.bs / 32), dev = Math.abs(Math.log10(p.lr / best));
  const ctxGain = 0.04 * (1 - Math.exp(-(p.ctx - 512) / 6e3));
  const bsPen = p.bs < 16 ? 0.02 : p.bs > 256 ? 0.015 : 0;
  const acc = clamp(0.8 + ctxGain - 0.075 * Math.pow(dev, 1.5) - bsPen, 0.2, 0.96) * 100;
  const lat = 28 + p.ctx * 0.012 + p.bs * 0.22;
  return { acc: Math.round(acc * 10) / 10, lat: Math.round(lat * 10) / 10 };
}
const fmtLr = (v) => v.toExponential(1).replace(".0e", "e").replace("e-", "e-");
const SL = {
  lr: { label: "Learning Rate", max: 100, to: (v) => (Math.log10(v) + 5) / 4 * 100, from: (s) => Number(Math.pow(10, -5 + s / 100 * 4).toPrecision(2)), fmt: fmtLr },
  bs: { label: "Batch Size", max: 6, to: (v) => Math.log2(v / 8), from: (s) => 8 * Math.pow(2, s), fmt: (v) => String(v) },
  ctx: { label: "Context Window", max: 6, to: (v) => Math.log2(v / 512), from: (s) => 512 * Math.pow(2, s), fmt: (v) => (v >= 1024 ? v / 1024 + "k" : String(v)) + " tokens" }
};
function seed() {
  const N = (id, type, title, sub, x, y, t, tags, ai, exp) => ({ id, type, title, sub, x, y, t, tags, ai: ai || null, exp: exp || null });
  const nodes = [
    N("d1", "dataset", "Natural Questions", "307k train \xB7 Google \xB7 Wikipedia", 0, 40, 0, ["Datasets"]),
    N("p1", "paper", "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", "Lewis et al. \xB7 2020 \xB7 NeurIPS", 330, 0, 1, ["Transformers"]),
    N("p2", "paper", "Dense Passage Retrieval for Open-Domain Question Answering", "Karpukhin et al. \xB7 2020 \xB7 EMNLP", 330, 190, 2, ["Transformers", "Datasets"]),
    N("d2", "dataset", "MS MARCO Passage Ranking", "8.8M passages \xB7 Microsoft", 0, 260, 3, ["Datasets"]),
    N("p3", "paper", "Self-RAG: Learning to Retrieve, Generate, and Critique", "Asai et al. \xB7 2023 \xB7 ICLR 2024", 330, 380, 4, ["Transformers", "Optimization"]),
    N("c1", "code", "rag-eval-harness", "Python \xB7 1.2k LOC \xB7 main@a3f9c1", 660, 20, 5, ["Optimization"]),
    N(
      "x1",
      "experiment",
      "Reranker learning-rate study",
      "Simulated \xB7 cross-encoder reranker",
      660,
      190,
      6,
      ["Optimization"],
      { g: 96, ref: "p2", trace: ["Read Source #2 and extracted the retrieval setup (top-k = 20).", "Matched the dataset (Source #1) to the evaluation split.", "Fitted a seeded response surface over learning rate, batch size and context.", "Critic Agent checked that gains are labelled as simulated.", "Human approved the node."] },
      { base: { lr: 3e-4, bs: 32, ctx: 2048 }, params: { lr: 5e-4, bs: 64, ctx: 4096 } }
    ),
    N(
      "t1",
      "thought",
      "Late interaction may help long-tail entities. Verify on the NQ dev split.",
      "Literature Reviewer \xB7 2h ago",
      990,
      40,
      7,
      ["AgentThought", "Transformers"],
      { g: 91, ref: "p2", trace: ["Compared Source #2 with the ColBERT notes already on the canvas.", "Found 3 sentences that mention long-tail entities.", "Drafted a hypothesis and attached the supporting passages.", "Critic Agent flagged a small evidence base.", "Human approved the node."] }
    )
  ];
  const edges = [
    { a: "p1", b: "d1", label: "trains on" },
    { a: "p2", b: "d1", label: "trains on" },
    { a: "p2", b: "d2", label: "trains on" },
    { a: "p3", b: "p1", label: "cites" },
    { a: "p1", b: "p2", label: "cites" },
    { a: "c1", b: "p1", label: "generated by" },
    { a: "x1", b: "p2", label: "simulates" },
    { a: "x1", b: "c1", label: "generated by" },
    { a: "t1", b: "p2", label: "cites" }
  ];
  return { nodes, edges };
}
const SCRIPT = [
  { agent: "lit", work: "Searching the paper index for few-shot retrieval", type: "paper", title: "Atlas: Few-shot Learning with Retrieval Augmented Language Models", sub: "Izacard et al. \xB7 2022 \xB7 JMLR", parent: "p1", label: "cites", tags: ["Transformers"], g: 94, critic: "Atlas uses an 11B model, so comparing it with your 3B baseline may be unfair.", trace: ["Scanned 7 nodes and found Source #2 as the closest match.", "Queried the paper index for few-shot retrieval.", "Ranked 14 candidates by tag overlap and wording.", "Critic Agent compared model sizes.", "Human approved the node."] },
  { agent: "env", work: "Inspecting rag-eval-harness dependencies", type: "code", title: "faiss-index-builder (HNSW, 768-d)", sub: "Python \xB7 facebookresearch/faiss", parent: "c1", label: "generated by", tags: ["Optimization"], g: 89, critic: "faiss-cpu is unpinned, so the index may not reproduce on another machine.", trace: ["Read requirements.txt from the harness repository.", "Detected a Python project with an FAISS dependency.", "Drafted an index build script (simulated, nothing executed).", "Critic Agent checked version pinning.", "Human approved the node."] },
  { agent: "exp", work: "Designing a context-window ablation", type: "experiment", title: "Context-window ablation, 2k to 16k tokens", sub: "Simulated \xB7 cross-encoder reranker", parent: "d1", label: "simulates", tags: ["Optimization", "Datasets"], g: 92, exp: { base: { lr: 3e-4, bs: 32, ctx: 2048 }, params: { lr: 3e-4, bs: 32, ctx: 8192 } }, critic: "Simulated gains flatten past 8k tokens. Do not quote them as measured.", trace: ["Read Source #1 to pick the evaluation split.", "Chose four context sizes: 2k, 4k, 8k, 16k.", "Ran the closed-form response model (simulated).", "Critic Agent checked the saturation range.", "Human approved the node."] },
  { agent: "lit", work: "Reading the reranker study for follow-up ideas", type: "thought", title: "Reranking recovers recall that a small k loses.", sub: "Literature Reviewer \xB7 just now", parent: "x1", label: "cites", tags: ["AgentThought", "Optimization"], g: 87, critic: "This rests on one simulated run. Treat it as a hypothesis.", trace: ["Read the saved run on the reranker study.", "Compared accuracy at k = 5, 10 and 20.", "Wrote the hypothesis and attached the run as evidence.", "Critic Agent noted the single-run basis.", "Human approved the node."] },
  { agent: "lit", work: "Looking for late-interaction retrievers", type: "paper", title: "ColBERT: Efficient Passage Search via Contextualized Late Interaction", sub: "Khattab, Zaharia \xB7 2020 \xB7 SIGIR", parent: "p2", label: "cites", tags: ["Transformers"], g: 95, critic: "ColBERT needs far more index storage than DPR. Check your disk budget.", trace: ["Matched the late-interaction thought to Source #2.", "Found ColBERT as the standard reference.", "Compared index sizes with DPR.", "Critic Agent raised the storage cost.", "Human approved the node."] }
];
const AGENTS0 = {
  lit: { name: "Literature Reviewer", icon: "BookOpen", score: 72, status: "idle", step: "Ready" },
  env: { name: "Environment Setup Agent", icon: "Terminal", score: 64, status: "idle", step: "Ready" },
  exp: { name: "Experiment Simulator", icon: "FlaskConical", score: 58, status: "idle", step: "Ready" }
};
const clock = () => (/* @__PURE__ */ new Date()).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
let uid = 100;
function App() {
  const [data, setData] = useState(seed);
  const { nodes, edges } = data;
  const [view, setView] = useState({ x: 40, y: 60, k: 0.8 });
  const [sel, setSel] = useState(null);
  const [hl, setHl] = useState(null);
  const [q, setQ] = useState("");
  const [tagSel, setTagSel] = useState([]);
  const [left, setLeft] = useState(() => window.innerWidth >= 1024);
  const [right, setRight] = useState(() => window.innerWidth >= 1280);
  const [clustered, setClustered] = useState(false);
  const [anim, setAnim] = useState(false);
  const [agents, setAgents] = useState(AGENTS0);
  const [feed, setFeed] = useState(() => [{ id: "f0", kind: "info", agent: "lit", text: "Team ready. Each agent pauses here for your approval before anything is added to the canvas.", at: clock() }]);
  const [proposals, setProposals] = useState([]);
  const [qi, setQi] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [whatIf, setWhatIf] = useState(null);
  const [draft, setDraft] = useState(null);
  const [trace, setTrace] = useState(null);
  const [tlOpen, setTlOpen] = useState(false);
  const [tl, setTl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ title: "", type: "paper", busy: false });
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [stats, setStats] = useState({ approved: 0, rejected: 0, added: 0 });
  const stage = useRef(null), drag = useRef(null), pan = useRef(null), toastT = useRef(0);
  const say = useCallback((m) => {
    setToast(m);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(""), 3200);
  }, []);
  const maxT = useMemo(() => nodes.reduce((m, n) => Math.max(m, n.t), 0), [nodes]);
  const step = tl == null ? maxT : tl;
  const replaying = tl != null;
  const vis = useMemo(() => nodes.filter((n) => n.t <= step), [nodes, step]);
  const visIds = useMemo(() => new Set(vis.map((n) => n.id)), [vis]);
  const visEdges = useMemo(() => edges.filter((e) => visIds.has(e.a) && visIds.has(e.b)), [edges, visIds]);
  const byId = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const sources = useMemo(() => nodes.filter((n) => !n.ai && (n.type === "paper" || n.type === "dataset" || n.type === "code")).sort((a, b) => a.t - b.t), [nodes]);
  const srcNo = (id) => sources.findIndex((s) => s.id === id) + 1;
  const pendingP = proposals.find((p) => p.state === "pending");
  const cpos = useMemo(() => {
    const out = {}, cnt = {};
    nodes.slice().sort((a, b) => a.t - b.t).forEach((n) => {
      const c = COLS.indexOf(n.type);
      cnt[n.type] = cnt[n.type] || 0;
      out[n.id] = { x: c * 300 + 30, y: 70 + cnt[n.type] * 190 };
      cnt[n.type]++;
    });
    return out;
  }, [nodes]);
  const pos = (n) => clustered ? cpos[n.id] : { x: n.x, y: n.y };
  const fit = useCallback((list, useC) => {
    const el = stage.current;
    if (!el || !list.length) return;
    const P = (n) => useC ? cpos[n.id] : { x: n.x, y: n.y };
    const x0 = Math.min(...list.map((n) => P(n).x)) - 30, y0 = Math.min(...list.map((n) => P(n).y)) - 50;
    const x1 = Math.max(...list.map((n) => P(n).x + W)) + 30, y1 = Math.max(...list.map((n) => P(n).y + nodeH(n))) + 30;
    const cw = el.clientWidth, ch = el.clientHeight, k = clamp(Math.min(cw / (x1 - x0), ch / (y1 - y0)), 0.25, 1.1);
    setView({ k, x: (cw - (x1 - x0) * k) / 2 - x0 * k, y: (ch - (y1 - y0) * k) / 2 - y0 * k });
  }, [cpos]);
  useEffect(() => {
    const t = setTimeout(() => fit(nodes, false), 60);
    return () => clearTimeout(t);
  }, []);
  const centerOn = (id) => {
    const n = byId[id], el = stage.current;
    if (!n || !el) return;
    const p = pos(n), k = Math.max(view.k, 0.8);
    setView({ k, x: el.clientWidth / 2 - (p.x + W / 2) * k, y: el.clientHeight / 2 - (p.y + nodeH(n) / 2) * k });
  };
  const flash = (id) => {
    setHl(id);
    setTimeout(() => setHl((h) => h === id ? null : h), 2200);
  };
  const goTo = (id) => {
    if (tl != null && byId[id] && byId[id].t > tl) setTl(null);
    setSel(id);
    centerOn(id);
    flash(id);
    if (window.innerWidth < 1024) setLeft(false);
  };
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      setView((v) => {
        const nk = clamp(v.k * Math.exp(-e.deltaY * 15e-4), 0.2, 2);
        return { k: nk, x: px - (px - v.x) * (nk / v.k), y: py - (py - v.y) * (nk / v.k) };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const zoomBy = (f) => {
    const el = stage.current;
    setView((v) => {
      const nk = clamp(v.k * f, 0.2, 2), cx = el.clientWidth / 2, cy = el.clientHeight / 2;
      return { k: nk, x: cx - (cx - v.x) * (nk / v.k), y: cy - (cy - v.y) * (nk / v.k) };
    });
  };
  const onBgDown = (e) => {
    if (e.button) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pan.current = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onMove = (e) => {
    if (drag.current) {
      const d = drag.current, dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      setData((s) => ({ ...s, nodes: s.nodes.map((n) => n.id === d.id ? { ...n, x: Math.round(d.ox + dx / view.k), y: Math.round(d.oy + dy / view.k) } : n) }));
    } else if (pan.current) {
      const p = pan.current, dx = e.clientX - p.sx, dy = e.clientY - p.sy;
      if (Math.hypot(dx, dy) > 3) p.moved = true;
      setView((v) => ({ ...v, x: p.vx + dx, y: p.vy + dy }));
    }
  };
  const onUp = () => {
    if (pan.current && !pan.current.moved) setSel(null);
    pan.current = null;
    if (drag.current) {
      const d = drag.current;
      drag.current = null;
      if (!d.moved) {
        setSel(d.id);
        const n = byId[d.id];
        if (n && n.exp) openWhatIf(n);
      }
    }
  };
  const onNodeDown = (e, n) => {
    if (e.button) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    if (clustered || replaying) {
      drag.current = { id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: true, locked: true };
      drag.current.moved = false;
      drag.current.fixed = true;
    } else drag.current = { id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false };
  };
  const onNodeMove = (e) => {
    if (drag.current && drag.current.fixed) {
      if (Math.hypot(e.clientX - drag.current.sx, e.clientY - drag.current.sy) > 4 && !drag.current.warned) {
        drag.current.warned = true;
        say(clustered ? "Release the clusters to move cards." : "Return to live to move cards.");
      }
      return;
    }
    onMove(e);
  };
  function openWhatIf(n) {
    setWhatIf(n.id);
    setDraft({ ...n.exp.params });
    if (window.innerWidth < 1280) setRight(false);
  }
  const wiNode = whatIf && byId[whatIf];
  const base = wiNode ? predict(wiNode.exp.base) : null, cur = draft ? predict(draft) : null;
  const applyDraft = () => {
    setData((s) => ({ ...s, nodes: s.nodes.map((n) => n.id === whatIf ? { ...n, exp: { ...n.exp, params: { ...draft } } } : n) }));
    say("Applied. The card now shows " + cur.acc + "% predicted accuracy.");
  };
  const setAgent = (k, patch) => setAgents((a) => ({ ...a, [k]: { ...a[k], ...patch } }));
  useEffect(() => {
    if (pendingP || qi >= SCRIPT.length) return;
    const sp = SCRIPT[qi], first = qi === 0;
    const t1 = setTimeout(() => setAgent(sp.agent, { status: "working", step: sp.work }), (first ? 500 : 1800) / SPEED);
    const t2 = setTimeout(() => {
      const id = "pr" + ++uid;
      setProposals((p) => p.concat({ id, state: "pending", sp }));
      setFeed((f) => [{ id: "f" + id, kind: "proposal", pid: id, agent: sp.agent, at: clock() }].concat(f));
      setAgent(sp.agent, { status: "waiting", step: "Paused: waiting for your approval" });
    }, (first ? 2400 : 5200) / SPEED);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [pendingP, qi, runKey]);
  function freeSpot(parent) {
    const pp = pos(parent);
    for (const k of [0, 1, -1, 2, -2, 3, -3]) {
      const x = pp.x + 330, y = pp.y + k * 150;
      if (!nodes.some((n) => Math.abs(n.x - x) < W + 20 && Math.abs(n.y - y) < nodeH(n) + 16)) return { x, y };
    }
    return { x: pp.x + 330, y: pp.y + 450 };
  }
  function decide(pid, ok) {
    const p = proposals.find((x) => x.id === pid);
    if (!p || p.state !== "pending") return;
    const sp = p.sp;
    setProposals((ps) => ps.map((x) => x.id === pid ? { ...x, state: ok ? "approved" : "rejected" } : x));
    setAgent(sp.agent, { status: "idle", step: ok ? "Approved. Ready for the next task." : "Rejected. Adjusting the plan.", score: agents[sp.agent].score + (ok ? 6 : -4) });
    setQi((i) => i + 1);
    if (ok) {
      const parent = byId[sp.parent], at = freeSpot(parent), id = "ag" + ++uid;
      const node = { id, type: sp.type, title: sp.title, sub: sp.sub, x: at.x, y: at.y, t: maxT + 1, tags: sp.tags, ai: { g: sp.g, ref: sp.parent, trace: sp.trace }, exp: sp.exp || null };
      setData((s) => ({ nodes: s.nodes.concat(node), edges: s.edges.concat({ a: id, b: sp.parent, label: sp.label }) }));
      setTl(null);
      setPlaying(false);
      setStats((s) => ({ ...s, approved: s.approved + 1 }));
      setSel(id);
      flash(id);
      setTimeout(() => {
        const el = stage.current;
        if (el) {
          const k = Math.max(0.7, Math.min(view.k, 1));
          setView({ k, x: el.clientWidth / 2 - (at.x + W / 2) * k, y: el.clientHeight / 2 - (at.y + 70) * k });
        }
      }, 60);
      say("Spawned \u201C" + sp.title.slice(0, 44) + (sp.title.length > 44 ? "\u2026" : "") + "\u201D and linked it to Source #" + (srcNo(sp.parent) || "") + ".");
    } else {
      setStats((s) => ({ ...s, rejected: s.rejected + 1 }));
      say("Rejected. Nothing was added to the canvas.");
    }
    setFeed((f) => [{ id: "d" + pid, kind: ok ? "approved" : "rejected", agent: sp.agent, text: (ok ? "Approved: " : "Rejected: ") + sp.title, at: clock() }].concat(f));
  }
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setTl((cur2) => {
      const c = cur2 == null ? maxT : cur2;
      if (c >= maxT) {
        setPlaying(false);
        return null;
      }
      return c + 1;
    }), 900 / SPEED);
    return () => clearInterval(t);
  }, [playing, maxT]);
  const scrub = (v) => {
    setPlaying(false);
    setTl(v >= maxT ? null : v);
  };
  const tlNode = nodes.find((n) => n.t === step);
  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (tl == null) setTl(0);
    setPlaying(true);
  };
  const toggleCluster = () => {
    const next = !clustered;
    setAnim(true);
    setTimeout(() => setAnim(false), 800);
    setClustered(next);
    setSel(null);
    setTimeout(() => {
      fit(vis, next);
    }, 30);
    say(next ? "Grouped " + nodes.length + " nodes into 5 columns by type." : "Restored your layout.");
  };
  const loadDemo = () => {
    uid = 100;
    setData(seed());
    setProposals([]);
    setQi(0);
    setRunKey((k) => k + 1);
    setAgents(AGENTS0);
    setClustered(false);
    setSel(null);
    setWhatIf(null);
    setTrace(null);
    setStats({ approved: 0, rejected: 0, added: 0 });
    setFeed([{ id: "f" + Date.now(), kind: "info", agent: "lit", text: "Demo scenario loaded. Watch the map build up, then approve what the agents propose.", at: clock() }]);
    setTlOpen(true);
    setTl(0);
    setPlaying(true);
    setTimeout(() => fit(seed().nodes, false), 60);
  };
  const submitAdd = (e) => {
    e.preventDefault();
    const title = addForm.title.trim();
    if (!title) return;
    setAddForm((f) => ({ ...f, busy: true }));
    setTimeout(() => {
      const words = title.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      const score = (n) => words.filter((w) => (n.title + " " + n.tags.join(" ")).toLowerCase().includes(w)).length;
      const parent = nodes.filter((n) => !n.ai).sort((a, b) => score(b) - score(a))[0] || nodes[0];
      const at = freeSpot(parent), id = "u" + ++uid;
      const label2 = addForm.type === "paper" ? "cites" : addForm.type === "dataset" ? "trains on" : "generated by";
      const node = { id, type: addForm.type, title, sub: "Added by you \xB7 just now", x: at.x, y: at.y, t: maxT + 1, tags: addForm.type === "dataset" ? ["Datasets"] : addForm.type === "paper" ? ["Transformers"] : ["Optimization"], ai: null, exp: null };
      setData((s) => ({ nodes: s.nodes.concat(node), edges: s.edges.concat({ a: id, b: parent.id, label: label2 }) }));
      setTl(null);
      setPlaying(false);
      setStats((s) => ({ ...s, added: s.added + 1 }));
      setAddOpen(false);
      setAddForm({ title: "", type: "paper", busy: false });
      setSel(id);
      flash(id);
      setTimeout(() => centerOn(id), 80);
      say("Added \u201C" + title.slice(0, 40) + "\u201D and linked it to \u201C" + parent.title.slice(0, 34) + "\u201D.");
    }, 700 / SPEED);
  };
  const markdown = useMemo(() => {
    const L = ["# ResearchGraph: Retrieval-Augmented QA", "", "_" + nodes.length + " nodes \xB7 " + edges.length + " links \xB7 exported " + (/* @__PURE__ */ new Date()).toLocaleString("en-GB") + "_", ""];
    COLS.forEach((t) => {
      const xs = nodes.filter((n) => n.type === t).sort((a, b) => a.t - b.t);
      if (!xs.length) return;
      L.push("## " + TYPES[t].label + (xs.length > 1 ? "s" : ""), "");
      xs.forEach((n) => {
        L.push("- **" + n.title + "** (" + n.sub + ")" + (n.ai ? " \xB7 " + n.ai.g + "% grounded, ref Source #" + srcNo(n.ai.ref) : "") + (n.exp ? " \xB7 simulated " + predict(n.exp.params).acc + "% acc" : ""));
      });
      L.push("");
    });
    L.push("## Relationships", "");
    edges.forEach((e) => L.push("- " + (byId[e.a] ? byId[e.a].title : e.a).slice(0, 60) + " \u2192 _" + e.label + "_ \u2192 " + (byId[e.b] ? byId[e.b].title : e.b).slice(0, 60)));
    return L.join("\n") + "\n";
  }, [nodes, edges, sources]);
  const copyMd = () => {
    const done = () => say("Copied Markdown to the clipboard.");
    const sel2 = () => {
      const r = document.createRange();
      r.selectNodeContents(document.getElementById("md-pre"));
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      say("Press Ctrl+C or \u2318C to copy the selected text.");
    };
    try {
      navigator.clipboard.writeText(markdown).then(done, sel2);
    } catch (e) {
      sel2();
    }
  };
  const linked = edges.length, synthesized = sources.length + stats.approved;
  const hours = (sources.length * 0.6 + stats.approved * 0.9 + 1.2).toFixed(1);
  const filtering = !!q.trim() || tagSel.length > 0;
  const matches = (n) => {
    if (tagSel.length && !n.tags.some((t) => tagSel.includes(t))) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return s.split(/\s+/).every((w) => (n.title + " " + n.sub + " " + n.tags.join(" ") + " " + TYPES[n.type].label).toLowerCase().includes(w));
  };
  const hits = nodes.filter(matches).length;
  useEffect(() => {
    const k = (e) => {
      if (e.key !== "Escape") return;
      if (trace) setTrace(null);
      else if (exportOpen) setExportOpen(false);
      else if (addOpen) setAddOpen(false);
      else if (whatIf) setWhatIf(null);
      else if (sel) setSel(null);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  const edgePaths = visEdges.map((e, i) => {
    const a = byId[e.a], b = byId[e.b], pa = pos(a), pb = pos(b), ha = nodeH(a), hb = nodeH(b);
    let sx, sy, ex, ey, c1x, c1y, c2x, c2y;
    if (pb.x > pa.x + W - 40) {
      sx = pa.x + W;
      sy = pa.y + ha / 2;
      ex = pb.x;
      ey = pb.y + hb / 2;
      const o = Math.max(50, (ex - sx) / 2);
      c1x = sx + o;
      c1y = sy;
      c2x = ex - o;
      c2y = ey;
    } else if (pa.x > pb.x + W - 40) {
      sx = pa.x;
      sy = pa.y + ha / 2;
      ex = pb.x + W;
      ey = pb.y + hb / 2;
      const o = Math.max(50, (sx - ex) / 2);
      c1x = sx - o;
      c1y = sy;
      c2x = ex + o;
      c2y = ey;
    } else {
      const d = pb.y > pa.y ? 1 : -1;
      sx = pa.x + W / 2;
      sy = d > 0 ? pa.y + ha : pa.y;
      ex = pb.x + W / 2;
      ey = d > 0 ? pb.y : pb.y + hb;
      const o = Math.max(40, Math.abs(ey - sy) / 2) * d;
      c1x = sx;
      c1y = sy + o;
      c2x = ex;
      c2y = ey - o;
    }
    const mx = (sx + 3 * c1x + 3 * c2x + ex) / 8, my = (sy + 3 * c1y + 3 * c2y + ey) / 8;
    const on = sel && (e.a === sel || e.b === sel);
    return { i, d: `M${sx} ${sy}C${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey}`, mx, my, label: e.label, on, dim: filtering && !(matches(a) && matches(b)) };
  });
  const Btn = ({ icon, label: label2, onClick, primary, title, id }) => /* @__PURE__ */ React.createElement("button", { id, onClick, title: title || label2, className: "h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border text-[13px] font-medium whitespace-nowrap transition-colors " + (primary ? "bg-indigo-500 border-indigo-400/60 text-white hover:bg-indigo-400" : "bg-zinc-900 border-zinc-800 text-zinc-200 hover:bg-zinc-800 hover:border-zinc-700") }, /* @__PURE__ */ React.createElement(Ic, { n: icon, size: 15 }), /* @__PURE__ */ React.createElement("span", { className: "hidden lg:inline" }, label2));
  const Stat = ({ icon, v, l, id }) => /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 min-w-0" }, /* @__PURE__ */ React.createElement(Ic, { n: icon, size: 14, className: "text-zinc-500 shrink-0" }), /* @__PURE__ */ React.createElement("span", { id, className: "font-mono text-[12px] text-zinc-100 tabular-nums" }, v), /* @__PURE__ */ React.createElement("span", { className: "text-[11.5px] text-zinc-500 truncate" }, l));
  const dot = (s) => s === "working" ? "bg-indigo-400 animate-pulse" : s === "waiting" ? "bg-amber-400" : "bg-zinc-600";
  const label = (s) => s === "working" ? "Working" : s === "waiting" ? "Waiting for approval" : "Idle";
  return /* @__PURE__ */ React.createElement("div", { className: "h-screen w-full flex flex-col bg-zinc-950 text-zinc-200 overflow-hidden select-none", style: { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif", fontSize: 13 } }, /* @__PURE__ */ React.createElement("header", { className: "shrink-0 border-b border-zinc-800 bg-zinc-950" }, /* @__PURE__ */ React.createElement("div", { className: "h-12 px-3 flex items-center gap-2" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setLeft((v) => !v), "aria-label": "Toggle library", "aria-expanded": left, className: "h-8 w-8 grid place-items-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100" }, /* @__PURE__ */ React.createElement(Ic, { n: "PanelLeft" })), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 min-w-0" }, /* @__PURE__ */ React.createElement("div", { className: "h-6 w-6 rounded-md bg-zinc-900 border border-zinc-800 grid place-items-center" }, /* @__PURE__ */ React.createElement(Ic, { n: "Share2", size: 13, className: "text-indigo-400" })), /* @__PURE__ */ React.createElement("span", { className: "font-semibold text-zinc-100 tracking-tight hidden sm:inline" }, "ResearchGraph")), /* @__PURE__ */ React.createElement("span", { className: "hidden md:inline-flex items-center gap-2 h-7 px-3 rounded-full border border-zinc-800 bg-zinc-900/60 text-[12px] text-zinc-400 whitespace-nowrap" }, /* @__PURE__ */ React.createElement("span", { className: "h-1.5 w-1.5 rounded-full bg-emerald-400", style: { boxShadow: "0 0 0 3px rgba(52,211,153,.14)" } }), "Local-First Synced"), /* @__PURE__ */ React.createElement("div", { className: "flex-1" }), /* @__PURE__ */ React.createElement(Btn, { id: "btnAdd", icon: "Plus", label: "Add Source", primary: true, onClick: () => setAddOpen(true) }), /* @__PURE__ */ React.createElement(Btn, { id: "btnCluster", icon: "Layers", label: clustered ? "Release Clusters" : "Auto-Cluster Canvas", onClick: toggleCluster }), /* @__PURE__ */ React.createElement(Btn, { id: "btnDemo", icon: "Sparkles", label: "Load Demo Scenario", onClick: loadDemo }), /* @__PURE__ */ React.createElement(Btn, { id: "btnExport", icon: "Download", label: "Export Markdown", onClick: () => setExportOpen(true) }), /* @__PURE__ */ React.createElement("button", { onClick: () => setRight((v) => !v), "aria-label": "Toggle agent team", "aria-expanded": right, className: "h-8 w-8 grid place-items-center rounded-lg text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 relative" }, /* @__PURE__ */ React.createElement(Ic, { n: "PanelRight" }), pendingP && /* @__PURE__ */ React.createElement("span", { className: "absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-400" }))), /* @__PURE__ */ React.createElement("div", { id: "telemetry", className: "h-8 px-4 flex items-center gap-5 border-t border-zinc-900 bg-zinc-950/80 overflow-x-auto whitespace-nowrap" }, /* @__PURE__ */ React.createElement("span", { className: "text-[10.5px] font-mono uppercase tracking-widest text-zinc-600 shrink-0" }, "Session impact"), /* @__PURE__ */ React.createElement(Stat, { id: "tNodes", icon: "Link2", v: linked, l: "Nodes Linked" }), /* @__PURE__ */ React.createElement(Stat, { id: "tSrc", icon: "BookMarked", v: synthesized, l: "Sources Synthesized" }), /* @__PURE__ */ React.createElement(Stat, { id: "tHrs", icon: "Clock", v: hours + " h", l: "Est. Hours Saved" }))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 min-h-0 flex relative" }, left && /* @__PURE__ */ React.createElement("aside", { "aria-label": "Library", className: "absolute lg:static z-30 h-full w-[280px] max-w-[88vw] shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col shadow-2xl lg:shadow-none" }, /* @__PURE__ */ React.createElement("div", { className: "p-3 shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "relative" }, /* @__PURE__ */ React.createElement("span", { className: "absolute left-2.5 top-2.5 text-zinc-500" }, /* @__PURE__ */ React.createElement(Ic, { n: "Search", size: 15 })), /* @__PURE__ */ React.createElement("input", { id: "search", value: q, onChange: (e) => setQ(e.target.value), placeholder: "Filter by title or keyword", className: "w-full h-9 pl-8 pr-3 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-400", style: { userSelect: "text" } })), filtering && /* @__PURE__ */ React.createElement("div", { className: "mt-2 text-[11.5px] text-zinc-500 flex items-center justify-between" }, /* @__PURE__ */ React.createElement("span", { id: "hits" }, hits, " of ", nodes.length, " nodes match"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
    setQ("");
    setTagSel([]);
  }, className: "text-indigo-400 hover:text-indigo-300" }, "Clear"))), /* @__PURE__ */ React.createElement("div", { className: "px-3 pb-3 shrink-0" }, /* @__PURE__ */ React.createElement("div", { className: "text-[10.5px] font-mono uppercase tracking-widest text-zinc-500 mb-2" }, "Tags"), /* @__PURE__ */ React.createElement("div", { className: "flex flex-wrap gap-1.5" }, TAGS.map((t) => {
    const on = tagSel.includes(t);
    return /* @__PURE__ */ React.createElement("button", { key: t, "data-tag": t, "aria-pressed": on, onClick: () => setTagSel((s) => on ? s.filter((x) => x !== t) : s.concat(t)), className: "h-6 px-2.5 rounded-full border text-[12px] " + (on ? "border-indigo-400/60 bg-indigo-500/15 text-indigo-200" : "border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:border-zinc-700") }, "#", t);
  }))), /* @__PURE__ */ React.createElement("div", { className: "px-3 text-[10.5px] font-mono uppercase tracking-widest text-zinc-500 mb-1 shrink-0" }, "Workspace artifacts \xB7 ", vis.length), /* @__PURE__ */ React.createElement("div", { id: "artifacts", className: "flex-1 min-h-0 overflow-y-auto px-2 pb-3" }, vis.slice().sort((a, b) => a.t - b.t).map((n) => {
    const T = TYPES[n.type], dim = filtering && !matches(n);
    return /* @__PURE__ */ React.createElement("button", { key: n.id, "data-art": n.id, onClick: () => goTo(n.id), className: "w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left hover:bg-zinc-800/70 " + (sel === n.id ? "bg-zinc-800" : "") + (dim ? " opacity-35" : "") }, /* @__PURE__ */ React.createElement("span", { className: "h-5 w-5 shrink-0 grid place-items-center rounded-md", style: { color: T.color, background: T.color + "22" } }, /* @__PURE__ */ React.createElement(Ic, { n: T.icon, size: 12 })), /* @__PURE__ */ React.createElement("span", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("span", { className: "block truncate text-zinc-200" }, n.title), /* @__PURE__ */ React.createElement("span", { className: "block truncate text-[11px] font-mono text-zinc-600" }, T.label)));
  }))), /* @__PURE__ */ React.createElement("main", { className: "flex-1 min-w-0 relative bg-zinc-950 flex flex-col" }, /* @__PURE__ */ React.createElement(
    "div",
    {
      ref: stage,
      id: "stage",
      className: "flex-1 min-h-0 relative overflow-hidden",
      style: { touchAction: "none", cursor: pan.current ? "grabbing" : "grab", backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,.07) 1px, transparent 1.3px)", backgroundSize: 24 * view.k + "px " + 24 * view.k + "px", backgroundPosition: view.x + "px " + view.y + "px" },
      onPointerDown: onBgDown,
      onPointerMove: onNodeMove,
      onPointerUp: onUp,
      onPointerCancel: onUp
    },
    /* @__PURE__ */ React.createElement("div", { id: "world", style: { position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate(${view.x}px,${view.y}px) scale(${view.k})` } }, clustered && COLS.map((t, i) => /* @__PURE__ */ React.createElement("div", { key: t, className: "absolute text-[10.5px] font-mono uppercase tracking-widest text-zinc-500", style: { left: i * 300 + 30, top: 30, width: W, borderBottom: "1px dashed #3f3f46", paddingBottom: 6 } }, TYPES[t].label, "s \xB7 ", vis.filter((n) => n.type === t).length)), /* @__PURE__ */ React.createElement("svg", { width: "1", height: "1", style: { position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }, "aria-hidden": "true" }, edgePaths.map((p) => /* @__PURE__ */ React.createElement("path", { key: p.i, d: p.d, fill: "none", stroke: p.on ? "#818cf8" : "#3f3f46", strokeWidth: p.on ? 2 : 1.5, opacity: p.dim ? 0.15 : sel && !p.on ? 0.45 : 1, style: { transition: anim ? "d .6s" : "none" }, vectorEffect: "non-scaling-stroke" })), edgePaths.map((p) => /* @__PURE__ */ React.createElement("text", { key: "l" + p.i, x: p.mx, y: p.my + 3, textAnchor: "middle", fontSize: "10.5", fontFamily: "JetBrains Mono, ui-monospace, monospace", fill: p.on ? "#c7d2fe" : "#a1a1aa", stroke: "#09090b", strokeWidth: "5", paintOrder: "stroke", opacity: p.dim ? 0.15 : 1 }, p.label))), vis.map((n) => {
      const T = TYPES[n.type], p = pos(n), dim = filtering && !matches(n), isSel = sel === n.id, isHl = hl === n.id;
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: n.id,
          "data-node": n.id,
          "data-type": n.type,
          onPointerDown: (e) => onNodeDown(e, n),
          className: "absolute rounded-xl border bg-zinc-900 overflow-hidden",
          style: { left: p.x, top: p.y, width: W, height: nodeH(n), padding: 12, cursor: "grab", opacity: dim ? 0.22 : 1, borderColor: isSel || isHl ? "#818cf8" : "#27272a", boxShadow: isSel || isHl ? "0 0 0 4px rgba(129,140,248,.18)" : "0 10px 28px -14px rgba(0,0,0,.8)", transition: (anim ? "left .6s cubic-bezier(.2,.8,.2,1), top .6s cubic-bezier(.2,.8,.2,1), " : "") + "opacity .2s, border-color .15s, box-shadow .15s" }
        },
        /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("span", { className: "inline-flex items-center gap-1 h-5 px-1.5 rounded-md ring-1 ring-inset text-[10px] font-mono uppercase tracking-wider " + T.badge }, /* @__PURE__ */ React.createElement(Ic, { n: T.icon, size: 11 }), T.label), n.ai && /* @__PURE__ */ React.createElement("span", { className: "ml-auto text-[10px] font-mono text-zinc-500" }, "AI")),
        /* @__PURE__ */ React.createElement("div", { className: "mt-2 text-[13px] leading-snug font-medium text-zinc-100", style: { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } }, n.title),
        /* @__PURE__ */ React.createElement("div", { className: "mt-1 text-[11px] font-mono text-zinc-500 truncate" }, n.sub),
        n.exp && /* @__PURE__ */ React.createElement("div", { className: "mt-2 flex items-end gap-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "text-[15px] font-semibold text-zinc-50 tabular-nums" }, predict(n.exp.params).acc, "%"), /* @__PURE__ */ React.createElement("div", { className: "text-[10.5px] font-mono text-zinc-500" }, "accuracy")), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "text-[15px] font-semibold text-zinc-50 tabular-nums" }, predict(n.exp.params).lat, " ms"), /* @__PURE__ */ React.createElement("div", { className: "text-[10.5px] font-mono text-zinc-500" }, "latency"))),
        n.ai && /* @__PURE__ */ React.createElement("div", { className: "absolute left-3 right-3 bottom-3 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("button", { "data-ground": n.id, onPointerDown: (e) => e.stopPropagation(), onClick: (e) => {
          e.stopPropagation();
          goTo(n.ai.ref);
        }, title: "Highlight the parent source", className: "min-w-0 flex-1 h-6 px-2 rounded-md bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30 text-emerald-300 text-[10.5px] font-medium truncate hover:bg-emerald-500/20 inline-flex items-center gap-1" }, /* @__PURE__ */ React.createElement(Ic, { n: "ShieldCheck", size: 11, className: "shrink-0" }), /* @__PURE__ */ React.createElement("span", { className: "truncate" }, n.ai.g, "% Grounded \u2022 Ref: Source #", srcNo(n.ai.ref))), /* @__PURE__ */ React.createElement("button", { "data-trace": n.id, onPointerDown: (e) => e.stopPropagation(), onClick: (e) => {
          e.stopPropagation();
          setTrace(n.id);
        }, className: "h-6 px-2 rounded-md border border-zinc-700 text-[10.5px] text-zinc-300 hover:bg-zinc-800 shrink-0 inline-flex items-center gap-1" }, /* @__PURE__ */ React.createElement(Ic, { n: "Terminal", size: 11 }), "Inspect Trace"))
      );
    })),
    replaying && /* @__PURE__ */ React.createElement("div", { className: "absolute top-3 left-1/2 -translate-x-1/2 z-10 h-7 px-3 rounded-full bg-zinc-900/95 border border-indigo-400/40 text-[12px] text-indigo-200 inline-flex items-center gap-2" }, /* @__PURE__ */ React.createElement(Ic, { n: "History", size: 13 }), "Replaying \xB7 step ", step + 1, " of ", maxT + 1),
    /* @__PURE__ */ React.createElement("div", { className: "absolute left-4 bottom-4 z-10 flex items-center gap-0.5 p-1 rounded-xl bg-zinc-900/95 border border-zinc-800", onPointerDown: (e) => e.stopPropagation() }, /* @__PURE__ */ React.createElement("button", { "aria-label": "Zoom out", onClick: () => zoomBy(0.8), className: "h-7 w-7 grid place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800" }, /* @__PURE__ */ React.createElement(Ic, { n: "Minus", size: 15 })), /* @__PURE__ */ React.createElement("span", { id: "zoomLbl", className: "w-11 text-center font-mono text-[11px] text-zinc-400" }, Math.round(view.k * 100), "%"), /* @__PURE__ */ React.createElement("button", { "aria-label": "Zoom in", onClick: () => zoomBy(1.25), className: "h-7 w-7 grid place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800" }, /* @__PURE__ */ React.createElement(Ic, { n: "Plus", size: 15 })), /* @__PURE__ */ React.createElement("button", { "aria-label": "Fit to screen", onClick: () => fit(vis, clustered), className: "h-7 w-7 grid place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800" }, /* @__PURE__ */ React.createElement(Ic, { n: "Maximize2", size: 14 })), /* @__PURE__ */ React.createElement("span", { className: "w-px h-5 bg-zinc-800 mx-1" }), /* @__PURE__ */ React.createElement("button", { id: "tlToggle", "aria-expanded": tlOpen, onClick: () => setTlOpen((v) => !v), className: "h-7 px-2 inline-flex items-center gap-1.5 rounded-lg text-[12px] " + (tlOpen ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-800") }, /* @__PURE__ */ React.createElement(Ic, { n: "History", size: 14 }), "Timeline")),
    /* @__PURE__ */ React.createElement("div", { className: "absolute right-4 bottom-4 z-10 hidden xl:flex items-center gap-3 h-9 px-3 rounded-xl bg-zinc-900/95 border border-zinc-800 text-[12px] text-zinc-400", onPointerDown: (e) => e.stopPropagation() }, COLS.map((t) => /* @__PURE__ */ React.createElement("span", { key: t, className: "inline-flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement("i", { style: { width: 8, height: 8, borderRadius: 2, background: TYPES[t].color, display: "inline-block" } }), TYPES[t].label))),
    wiNode && draft && /* @__PURE__ */ React.createElement("aside", { id: "whatif", onPointerDown: (e) => e.stopPropagation(), "aria-label": "What-if parameters", className: "absolute top-0 right-0 bottom-0 z-20 w-[min(400px,100%)] bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl cursor-default", style: { animation: "rgslide .25s ease" } }, /* @__PURE__ */ React.createElement("div", { className: "p-4 border-b border-zinc-800 flex items-start gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("div", { className: "text-[10.5px] font-mono uppercase tracking-widest text-rose-300 flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Ic, { n: "FlaskConical", size: 13 }), "What-if \xB7 simulated"), /* @__PURE__ */ React.createElement("h3", { className: "mt-1.5 text-[15px] font-semibold text-zinc-50 leading-snug" }, wiNode.title), /* @__PURE__ */ React.createElement("div", { className: "text-[11.5px] font-mono text-zinc-500 mt-0.5" }, wiNode.sub)), /* @__PURE__ */ React.createElement("button", { "aria-label": "Close panel", onClick: () => setWhatIf(null), className: "h-7 w-7 grid place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800" }, /* @__PURE__ */ React.createElement(Ic, { n: "X", size: 15 }))), /* @__PURE__ */ React.createElement("div", { className: "flex-1 overflow-y-auto p-4" }, /* @__PURE__ */ React.createElement("div", { className: "text-[10.5px] font-mono uppercase tracking-widest text-zinc-500" }, "Predicted accuracy"), /* @__PURE__ */ React.createElement("div", { className: "flex items-baseline gap-2.5 mt-1" }, /* @__PURE__ */ React.createElement("span", { id: "wiAcc", className: "text-[34px] leading-none font-semibold text-zinc-50 tabular-nums tracking-tight" }, cur.acc.toFixed(1), "%"), /* @__PURE__ */ React.createElement(Delta, { id: "wiAccD", v: +(cur.acc - base.acc).toFixed(1), unit: " pts", good: cur.acc >= base.acc })), /* @__PURE__ */ React.createElement("div", { className: "grid grid-cols-2 gap-2 mt-4" }, /* @__PURE__ */ React.createElement("div", { className: "p-3 rounded-xl border border-zinc-800 bg-zinc-950" }, /* @__PURE__ */ React.createElement("div", { className: "text-[10.5px] font-mono uppercase tracking-widest text-zinc-500" }, "Latency"), /* @__PURE__ */ React.createElement("div", { id: "wiLat", className: "text-[16px] font-semibold text-zinc-50 tabular-nums mt-1" }, cur.lat, " ms"), /* @__PURE__ */ React.createElement(Delta, { id: "wiLatD", v: +(cur.lat - base.lat).toFixed(1), unit: " ms", good: cur.lat <= base.lat })), /* @__PURE__ */ React.createElement("div", { className: "p-3 rounded-xl border border-zinc-800 bg-zinc-950" }, /* @__PURE__ */ React.createElement("div", { className: "text-[10.5px] font-mono uppercase tracking-widest text-zinc-500" }, "vs baseline"), /* @__PURE__ */ React.createElement("div", { className: "text-[16px] font-semibold text-zinc-50 tabular-nums mt-1" }, base.acc.toFixed(1), "%"), /* @__PURE__ */ React.createElement("span", { className: "text-[11px] font-mono text-zinc-500" }, base.lat, " ms"))), /* @__PURE__ */ React.createElement("div", { className: "mt-5 space-y-4" }, Object.keys(SL).map((k) => /* @__PURE__ */ React.createElement("div", { key: k }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center justify-between" }, /* @__PURE__ */ React.createElement("label", { htmlFor: "sl-" + k, className: "text-[12.5px] font-medium text-zinc-200" }, SL[k].label), /* @__PURE__ */ React.createElement("span", { id: "val-" + k, className: "font-mono text-[12px] text-indigo-300" }, SL[k].fmt(draft[k]))), /* @__PURE__ */ React.createElement("input", { id: "sl-" + k, type: "range", min: "0", max: SL[k].max, step: k === "lr" ? 1 : 1, value: Math.round(SL[k].to(draft[k])), onChange: (e) => setDraft((d) => ({ ...d, [k]: SL[k].from(+e.target.value) })), className: "w-full mt-2 accent-indigo-400" }), /* @__PURE__ */ React.createElement("div", { className: "flex justify-between text-[10.5px] font-mono text-zinc-600" }, /* @__PURE__ */ React.createElement("span", null, SL[k].fmt(SL[k].from(0))), /* @__PURE__ */ React.createElement("span", null, "baseline ", SL[k].fmt(wiNode.exp.base[k])), /* @__PURE__ */ React.createElement("span", null, SL[k].fmt(SL[k].from(SL[k].max))))))), cur.acc < base.acc - 3 && /* @__PURE__ */ React.createElement("div", { className: "mt-4 text-[12px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg p-2.5" }, "This setting is predicted to lose accuracy against the baseline.")), /* @__PURE__ */ React.createElement("div", { className: "p-3 border-t border-zinc-800 flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "mr-auto text-[10.5px] text-zinc-500 leading-snug" }, "Predictions come from a model, not a real run."), /* @__PURE__ */ React.createElement("button", { id: "wiReset", onClick: () => setDraft({ ...wiNode.exp.base }), className: "h-8 px-3 rounded-lg border border-zinc-700 text-zinc-200 hover:bg-zinc-800" }, "Reset"), /* @__PURE__ */ React.createElement("button", { id: "wiApply", onClick: applyDraft, className: "h-8 px-3 rounded-lg bg-indigo-500 text-white hover:bg-indigo-400" }, "Apply to node"))),
    toast && /* @__PURE__ */ React.createElement("div", { role: "status", className: "absolute left-1/2 -translate-x-1/2 bottom-5 z-40 max-w-[calc(100%-32px)] px-3.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-100 text-[12.5px] shadow-xl pointer-events-none" }, toast)
  ), tlOpen && /* @__PURE__ */ React.createElement("div", { id: "timeline", className: "shrink-0 border-t border-zinc-800 bg-zinc-900 px-4 py-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2" }, /* @__PURE__ */ React.createElement("button", { "aria-label": "First step", onClick: () => scrub(0), className: "h-7 w-7 grid place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800" }, /* @__PURE__ */ React.createElement(Ic, { n: "SkipBack", size: 14 })), /* @__PURE__ */ React.createElement("button", { id: "tlPrev", "aria-label": "Step back", onClick: () => scrub(Math.max(0, step - 1)), className: "h-7 w-7 grid place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800" }, /* @__PURE__ */ React.createElement(Ic, { n: "ChevronLeft", size: 15 })), /* @__PURE__ */ React.createElement("button", { id: "tlPlay", "aria-label": playing ? "Pause" : "Play", onClick: togglePlay, className: "h-7 w-7 grid place-items-center rounded-lg bg-indigo-500 text-white hover:bg-indigo-400" }, /* @__PURE__ */ React.createElement(Ic, { n: playing ? "Pause" : "Play", size: 14 })), /* @__PURE__ */ React.createElement("button", { id: "tlNext", "aria-label": "Step forward", onClick: () => scrub(step + 1), className: "h-7 w-7 grid place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800" }, /* @__PURE__ */ React.createElement(Ic, { n: "ChevronRight", size: 15 })), /* @__PURE__ */ React.createElement("button", { "aria-label": "Latest", onClick: () => scrub(maxT), className: "h-7 w-7 grid place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800" }, /* @__PURE__ */ React.createElement(Ic, { n: "SkipForward", size: 14 })), /* @__PURE__ */ React.createElement("input", { id: "tlRange", type: "range", min: "0", max: maxT, step: "1", value: step, onChange: (e) => scrub(+e.target.value), "aria-label": "Timeline", className: "flex-1 min-w-0 accent-indigo-400 mx-2" }), /* @__PURE__ */ React.createElement("span", { id: "tlCount", className: "font-mono text-[11.5px] text-zinc-400 tabular-nums w-14 text-right" }, step + 1, " / ", maxT + 1), /* @__PURE__ */ React.createElement("button", { "aria-label": "Hide timeline", onClick: () => {
    setTlOpen(false);
    setPlaying(false);
    setTl(null);
  }, className: "h-7 w-7 grid place-items-center rounded-lg text-zinc-500 hover:bg-zinc-800" }, /* @__PURE__ */ React.createElement(Ic, { n: "ChevronDown", size: 15 }))), tlNode && /* @__PURE__ */ React.createElement("div", { id: "tlCaption", className: "mt-1.5 flex items-center gap-2 text-[12px] text-zinc-400 min-w-0" }, /* @__PURE__ */ React.createElement("i", { style: { width: 8, height: 8, borderRadius: 2, background: TYPES[tlNode.type].color, display: "inline-block", flex: "none" } }), /* @__PURE__ */ React.createElement("span", { className: "truncate" }, /* @__PURE__ */ React.createElement("span", { className: "text-zinc-200" }, tlNode.ai ? "Agent created" : "Added", " ", TYPES[tlNode.type].label.toLowerCase(), ":"), " ", tlNode.title)))), right && /* @__PURE__ */ React.createElement("aside", { "aria-label": "Agent team", className: "absolute right-0 lg:static z-30 h-full w-[344px] max-w-[92vw] shrink-0 bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl lg:shadow-none" }, /* @__PURE__ */ React.createElement("div", { className: "px-4 pt-4 pb-3 shrink-0" }, /* @__PURE__ */ React.createElement("h2", { className: "text-[14px] font-semibold text-zinc-50" }, "Agent team"), /* @__PURE__ */ React.createElement("div", { className: "mt-1 text-[12px] text-zinc-500 flex items-center gap-2" }, /* @__PURE__ */ React.createElement("span", { className: "h-1.5 w-1.5 rounded-full " + (pendingP ? "bg-amber-400" : "bg-emerald-400 animate-pulse") }), pendingP ? "Paused for your approval" : qi >= SCRIPT.length ? "All proposals reviewed" : "Live")), /* @__PURE__ */ React.createElement("div", { className: "px-4 pb-3 grid gap-2 shrink-0" }, Object.keys(agents).map((k) => {
    const a = agents[k];
    return /* @__PURE__ */ React.createElement("div", { key: k, "data-agent": k, className: "p-2.5 rounded-xl border bg-zinc-950 flex items-center gap-3 " + (a.status === "waiting" ? "border-amber-500/40" : a.status === "working" ? "border-indigo-400/40" : "border-zinc-800") }, /* @__PURE__ */ React.createElement("span", { className: "h-8 w-8 shrink-0 grid place-items-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300" }, /* @__PURE__ */ React.createElement(Ic, { n: a.icon, size: 15 })), /* @__PURE__ */ React.createElement("div", { className: "min-w-0 flex-1" }, /* @__PURE__ */ React.createElement("div", { className: "text-[12.5px] font-medium text-zinc-100 truncate" }, a.name), /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-1.5 text-[11px] text-zinc-500" }, /* @__PURE__ */ React.createElement("span", { className: "h-1.5 w-1.5 rounded-full shrink-0 " + dot(a.status) }), /* @__PURE__ */ React.createElement("span", { className: "truncate", title: a.step }, label(a.status), " \xB7 ", a.step))), /* @__PURE__ */ React.createElement("span", { title: "Reward score", className: "shrink-0 h-6 px-2 rounded-md bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/30 text-emerald-300 font-mono text-[11.5px] inline-flex items-center gap-1" }, /* @__PURE__ */ React.createElement(Ic, { n: "Star", size: 11 }), /* @__PURE__ */ React.createElement("span", { "data-score": k }, a.score)));
  })), /* @__PURE__ */ React.createElement("div", { className: "px-4 py-2 border-y border-zinc-800 text-[10.5px] font-mono uppercase tracking-widest text-zinc-500 shrink-0" }, "Activity & approvals"), /* @__PURE__ */ React.createElement("div", { id: "feed", className: "flex-1 min-h-0 overflow-y-auto" }, feed.map((it) => {
    const A = agents[it.agent];
    if (it.kind === "proposal") {
      const p = proposals.find((x) => x.id === it.pid), sp = p.sp, T = TYPES[sp.type], pend = p.state === "pending";
      return /* @__PURE__ */ React.createElement("div", { key: it.id, className: "p-4 border-b border-zinc-800" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-center gap-2 text-[12px]" }, /* @__PURE__ */ React.createElement("span", { className: "font-medium text-zinc-200" }, A.name), /* @__PURE__ */ React.createElement("span", { className: "text-[10px] font-mono uppercase tracking-wider text-amber-300 border border-amber-500/30 rounded px-1.5" }, "Proposal"), /* @__PURE__ */ React.createElement("span", { className: "ml-auto font-mono text-[11px] text-zinc-600" }, it.at)), /* @__PURE__ */ React.createElement("div", { className: "mt-2.5 p-3 rounded-xl border bg-zinc-950 " + (pend ? "border-indigo-400/40" : "border-zinc-800 opacity-70"), "data-proposal": p.state }, /* @__PURE__ */ React.createElement("span", { className: "inline-flex items-center gap-1 h-5 px-1.5 rounded-md ring-1 ring-inset text-[10px] font-mono uppercase tracking-wider " + T.badge }, /* @__PURE__ */ React.createElement(Ic, { n: T.icon, size: 11 }), "New ", T.label), /* @__PURE__ */ React.createElement("div", { className: "mt-2 text-[12.5px] font-medium text-zinc-100 leading-snug" }, sp.title), /* @__PURE__ */ React.createElement("div", { className: "mt-1 text-[11.5px] text-zinc-500" }, "Links to \u201C", byId[sp.parent].title.slice(0, 48), "\u201D \xB7 ", /* @__PURE__ */ React.createElement("span", { className: "text-zinc-400" }, sp.label)), /* @__PURE__ */ React.createElement("div", { className: "mt-2.5 flex items-start gap-2 text-[11.5px] text-amber-200 bg-amber-500/10 border border-amber-500/25 rounded-lg p-2" }, /* @__PURE__ */ React.createElement(Ic, { n: "ShieldAlert", size: 14, className: "shrink-0 mt-px" }), /* @__PURE__ */ React.createElement("span", null, "Critic: ", sp.critic.replace(/^Critic:\s*/, ""))), pend ? /* @__PURE__ */ React.createElement("div", { className: "mt-3 flex items-center gap-2" }, /* @__PURE__ */ React.createElement("button", { "data-act": "reject", onClick: () => decide(p.id, false), className: "h-8 px-3 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 inline-flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Ic, { n: "X", size: 13 }), "Reject"), /* @__PURE__ */ React.createElement("button", { "data-act": "approve", onClick: () => decide(p.id, true), className: "h-8 px-3 flex-1 rounded-lg bg-indigo-500 text-white font-medium hover:bg-indigo-400 inline-flex items-center justify-center gap-1.5" }, /* @__PURE__ */ React.createElement(Ic, { n: "Check", size: 14 }), "Approve & Spawn Node")) : /* @__PURE__ */ React.createElement("div", { className: "mt-3 text-[11.5px] font-mono " + (p.state === "approved" ? "text-emerald-300" : "text-zinc-500") }, p.state === "approved" ? "Approved and spawned" : "Rejected")));
    }
    return /* @__PURE__ */ React.createElement("div", { key: it.id, className: "px-4 py-2.5 border-b border-zinc-800/70 flex items-start gap-2 text-[12px] " + (it.kind === "rejected" ? "text-zinc-500" : "text-zinc-400") }, /* @__PURE__ */ React.createElement(Ic, { n: it.kind === "approved" ? "CheckCircle2" : it.kind === "rejected" ? "XCircle" : "Bot", size: 14, className: "shrink-0 mt-px " + (it.kind === "approved" ? "text-emerald-400" : "") }), /* @__PURE__ */ React.createElement("span", { className: "min-w-0 flex-1", style: { overflowWrap: "anywhere" } }, it.text), /* @__PURE__ */ React.createElement("span", { className: "font-mono text-[11px] text-zinc-600" }, it.at));
  })))), addOpen && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-50 grid place-items-center p-4" }, /* @__PURE__ */ React.createElement("div", { className: "absolute inset-0 bg-black/70", onClick: () => !addForm.busy && setAddOpen(false) }), /* @__PURE__ */ React.createElement("form", { id: "addForm", onSubmit: submitAdd, className: "relative w-[min(460px,100%)] rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl cursor-default" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-[16px] font-semibold text-zinc-50" }, "Add source"), /* @__PURE__ */ React.createElement("p", { className: "text-zinc-500 mt-1" }, "Name it. The agents read it, link it to related work and place it on the canvas.")), /* @__PURE__ */ React.createElement("button", { type: "button", "aria-label": "Close", onClick: () => setAddOpen(false), className: "h-7 w-7 grid place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800" }, /* @__PURE__ */ React.createElement(Ic, { n: "X", size: 15 }))), /* @__PURE__ */ React.createElement("label", { htmlFor: "fTitle", className: "block mt-4 mb-1.5 text-[12px] font-medium text-zinc-400" }, "Title"), /* @__PURE__ */ React.createElement("input", { id: "fTitle", autoFocus: true, value: addForm.title, disabled: addForm.busy, onChange: (e) => setAddForm((f) => ({ ...f, title: e.target.value })), placeholder: "e.g. Scaling laws for retrieval", className: "w-full h-9 px-3 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-100 placeholder-zinc-600 outline-none focus:border-indigo-400", style: { userSelect: "text" } }), /* @__PURE__ */ React.createElement("div", { className: "mt-3 grid grid-cols-3 gap-2" }, ["paper", "dataset", "code"].map((t) => /* @__PURE__ */ React.createElement("button", { type: "button", key: t, "aria-pressed": addForm.type === t, onClick: () => setAddForm((f) => ({ ...f, type: t })), className: "h-10 rounded-lg border inline-flex items-center justify-center gap-1.5 " + (addForm.type === t ? "border-indigo-400/60 bg-indigo-500/10 text-zinc-100" : "border-zinc-800 text-zinc-400 hover:text-zinc-100") }, /* @__PURE__ */ React.createElement(Ic, { n: TYPES[t].icon, size: 14 }), TYPES[t].label))), /* @__PURE__ */ React.createElement("div", { className: "mt-5 flex items-center justify-end gap-2" }, /* @__PURE__ */ React.createElement("button", { type: "button", onClick: () => setAddOpen(false), className: "h-8 px-3 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800" }, "Cancel"), /* @__PURE__ */ React.createElement("button", { id: "addSubmit", type: "submit", disabled: addForm.busy || !addForm.title.trim(), className: "h-8 px-3 rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-50" }, addForm.busy ? "Synthesizing\u2026" : "Add to canvas")))), exportOpen && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-50 grid place-items-center p-4" }, /* @__PURE__ */ React.createElement("div", { className: "absolute inset-0 bg-black/70", onClick: () => setExportOpen(false) }), /* @__PURE__ */ React.createElement("div", { id: "exportModal", className: "relative w-[min(680px,100%)] max-h-full flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl cursor-default" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-3" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", { className: "text-[16px] font-semibold text-zinc-50" }, "Export Markdown"), /* @__PURE__ */ React.createElement("p", { className: "text-zinc-500 mt-1" }, nodes.length, " nodes \xB7 ", edges.length, " relationships")), /* @__PURE__ */ React.createElement("button", { "aria-label": "Close", onClick: () => setExportOpen(false), className: "h-7 w-7 grid place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800" }, /* @__PURE__ */ React.createElement(Ic, { n: "X", size: 15 }))), /* @__PURE__ */ React.createElement("pre", { id: "md-pre", tabIndex: 0, className: "mt-4 flex-1 min-h-[160px] overflow-auto p-3.5 rounded-xl border border-zinc-800 bg-zinc-950 text-[12px] leading-relaxed text-zinc-300", style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere", userSelect: "text", fontFamily: "JetBrains Mono, ui-monospace, monospace", maxHeight: "50vh" } }, markdown), /* @__PURE__ */ React.createElement("div", { className: "mt-4 flex items-center justify-end gap-2" }, /* @__PURE__ */ React.createElement("button", { onClick: () => setExportOpen(false), className: "h-8 px-3 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800" }, "Close"), /* @__PURE__ */ React.createElement("button", { id: "mdCopy", onClick: copyMd, className: "h-8 px-3 rounded-lg bg-indigo-500 text-white hover:bg-indigo-400 inline-flex items-center gap-1.5" }, /* @__PURE__ */ React.createElement(Ic, { n: "Copy", size: 14 }), "Copy")))), trace && byId[trace] && /* @__PURE__ */ React.createElement("div", { className: "fixed inset-0 z-50 grid place-items-center p-4" }, /* @__PURE__ */ React.createElement("div", { className: "absolute inset-0 bg-black/70", onClick: () => setTrace(null) }), /* @__PURE__ */ React.createElement("div", { id: "traceModal", className: "relative w-[min(520px,100%)] max-h-full overflow-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl cursor-default" }, /* @__PURE__ */ React.createElement("div", { className: "flex items-start justify-between gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "min-w-0" }, /* @__PURE__ */ React.createElement("div", { className: "text-[10.5px] font-mono uppercase tracking-widest text-zinc-500" }, "Execution trace"), /* @__PURE__ */ React.createElement("h2", { className: "text-[15px] font-semibold text-zinc-50 mt-1 leading-snug" }, byId[trace].title), /* @__PURE__ */ React.createElement("p", { className: "text-[12px] text-emerald-300 mt-1" }, byId[trace].ai.g, "% grounded \xB7 Ref: Source #", srcNo(byId[trace].ai.ref), " \xB7 ", byId[byId[trace].ai.ref].title.slice(0, 40))), /* @__PURE__ */ React.createElement("button", { "aria-label": "Close", onClick: () => setTrace(null), className: "h-7 w-7 grid place-items-center rounded-lg text-zinc-400 hover:bg-zinc-800 shrink-0" }, /* @__PURE__ */ React.createElement(Ic, { n: "X", size: 15 }))), /* @__PURE__ */ React.createElement("ol", { className: "mt-4 space-y-0" }, byId[trace].ai.trace.map((s, i, a) => /* @__PURE__ */ React.createElement("li", { key: i, className: "flex gap-3" }, /* @__PURE__ */ React.createElement("div", { className: "flex flex-col items-center" }, /* @__PURE__ */ React.createElement("span", { className: "h-6 w-6 rounded-full border border-zinc-700 bg-zinc-950 grid place-items-center font-mono text-[11px] text-zinc-300" }, i + 1), i < a.length - 1 && /* @__PURE__ */ React.createElement("span", { className: "w-px flex-1 bg-zinc-800 my-1" })), /* @__PURE__ */ React.createElement("div", { className: "pb-4 pt-0.5 text-[12.5px] text-zinc-300 leading-snug" }, s)))), /* @__PURE__ */ React.createElement("p", { className: "text-[11px] text-zinc-600" }, "Simulated trace for this prototype. Nothing was run on a real model."))), /* @__PURE__ */ React.createElement("style", null, `@keyframes rgslide{from{transform:translateX(24px);opacity:0}}`));
}
function Delta({ v, unit, good, id }) {
  if (Math.abs(v) < 0.05) return /* @__PURE__ */ React.createElement("span", { id, className: "inline-block text-[11px] font-mono px-1.5 rounded text-zinc-500 bg-zinc-800" }, "same");
  return /* @__PURE__ */ React.createElement("span", { id, className: "inline-block text-[11px] font-mono px-1.5 rounded tabular-nums " + (good ? "text-emerald-300 bg-emerald-500/10" : "text-rose-300 bg-rose-500/10") }, v > 0 ? "+" : "\u2212", Math.abs(v), unit);
}
ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
