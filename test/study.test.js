const S = require('../src/study-core.js');
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
const items = [
  { id: 'p1', type: 'paper', title: 'Attention Is All You Need', meta: 'NeurIPS 2017', summary: 'Introduces the transformer, which relies on attention instead of recurrence. It trains faster on translation.', findings: ['Beats recurrent models on translation BLEU'], tags: ['attention', 'transformer'], topic: 'NLP' },
  { id: 'p2', type: 'paper', title: 'Scaling Laws for Language Models', meta: 'arXiv', summary: 'Loss falls as a power law with model size and data.', findings: ['Loss follows a power law'], tags: ['scaling'], topic: 'NLP' },
  { id: 'd1', type: 'dataset', title: 'WMT14 English-German', meta: 'dataset', summary: 'Parallel sentences for machine translation benchmarks.', findings: [], tags: ['translation'], topic: 'NLP' },
  { id: 'c1', type: 'code', title: 'tensor2tensor repo', meta: 'github', summary: 'Reference implementation of the transformer.', findings: [], tags: ['transformer'], topic: 'NLP' },
  { id: 'e1', type: 'experiment', title: 'Run A: 6 layers', meta: 'sim', summary: 'Baseline.', findings: ['More layers helped'], tags: [], topic: 'NLP', acc: 0.82, lat: 120 },
  { id: 'e2', type: 'experiment', title: 'Run B: 12 layers', meta: 'sim', summary: 'Deeper.', findings: [], tags: [], topic: 'NLP', acc: 0.88, lat: 210 },
  { id: 'n1', type: 'note', title: 'Check dropout', meta: '', summary: 'Try dropout 0.2.', findings: [], tags: [], topic: '' },
];
const edges = [{ a: 'p1', b: 'd1', reason: 'Evaluated on it', score: 0.9 }, { a: 'p1', b: 'c1', reason: 'Code for paper', score: 0.8 }, { a: 'e1', b: 'p1', reason: 'Replicates', score: 0.7 }];

const W = S.context(items, edges, null, 'Demo');
ok(W.scope === 'workspace' && W.nodes.length === 7 && W.edges.length === 3, 'workspace context');
const N = S.context(items, edges, 'p1', 'Demo');
ok(N.scope === 'node' && N.nodes.length === 4 && N.nodes[0].id === 'p1' && N.title === 'Attention Is All You Need', 'node context = selected + neighbours');
ok(S.context(items, edges, 'zzz', 'Demo').scope === 'workspace', 'unknown selection falls back to workspace');

const sl = S.slides(W);
ok(sl.length === 5 && sl.map(s => s.title).join('|') === 'Title & overview|Key sources & findings|Architecture & connections|Experiments & what-if takeaways|Next steps', 'five required slides');
ok(sl.every(s => s.bullets.length && s.notes), 'each slide has bullets and notes');
ok(/Best accuracy: Run B/.test(sl[3].bullets.join(' ')), 'experiment slide names the best run');
ok(/Hub/.test(sl[2].bullets.join(' ')), 'connections slide lists a hub');
const md = S.slidesMarkdown(sl, W, true);
ok(/^# Demo/.test(md) && /Speaker notes/.test(md) && !/Speaker notes/.test(S.slidesMarkdown(sl, W, false)), 'markdown with and without notes');
const E = S.slides(S.context([items[6]], [], null, 'Tiny'));
ok(E.length === 5 && E.every(s => s.bullets.length), 'one-card workspace still yields 5 slides');
ok(S.slides(S.context([], [], null, 'Empty')).length === 5, 'empty workspace does not throw');

const q = S.quiz(W, 1);
ok(q.length >= 5 && q.some(x => x.kind === 'mc') && q.some(x => x.kind === 'short'), 'quiz has both kinds');
ok(q.filter(x => x.kind === 'mc').every(x => x.options.length >= 3 && x.options[x.answer] && x.explain && W.byId[x.ref]), 'mc has options, answer, explanation and source card');
ok(q.filter(x => x.kind === 'mc').every(x => new Set(x.options).size === x.options.length), 'no duplicate options');
ok(JSON.stringify(S.quiz(W, 1)) === JSON.stringify(q) && JSON.stringify(S.quiz(W, 2)) !== JSON.stringify(q), 'seeded and repeatable');
const sh = q.find(x => x.kind === 'short');
ok(S.checkShort(sh, sh.model).ok && !S.checkShort(sh, 'banana pizza').ok, 'short answer accepts the model answer, rejects nonsense');
ok(S.quiz(S.context([], [], null, 'E'), 1).length === 0, 'empty quiz');

const c = S.cards(W);
ok(c.length >= 7 && c.every(x => x.front && x.back && x.ref), 'flashcards for each card');
ok(S.cards(W, 5).length === c.length && S.cards(W, 5)[0].id !== undefined, 'shuffle keeps all');

const m = S.mindmap(W);
ok(m.kind === 'root' && m.children.map(g => g.type).join() === 'paper,dataset,code,note,experiment', 'mind map groups by type');
ok(m.children[0].children[0].children[0].kind === 'finding' && m.children[0].children[0].ref === 'p1', 'mind map has finding leaves and refs');
const info = S.nodeInfo(W, 'p1');
ok(info.links.length === 3 && info.links[0].title && info.tags.includes('attention'), 'node info with links');
ok(S.nodeInfo(W, 'nope') === null, 'node info for missing card');

ok(/Score: 2 of 5/.test(S.summaryText('quiz', W, { score: 2, total: 5, missed: ['a'] })), 'quiz summary note');
ok(/Mastered: 1/.test(S.summaryText('cards', W, { mastered: 1, review: 2, left: 3, reviewTitles: ['x'] })), 'cards summary note');
ok(/## Papers/.test(S.summaryText('map', W, null)) && /## 1\./.test(S.summaryText('slides', W, sl)), 'map + slides summary notes');
console.log(fail ? fail + ' FAILED' : 'ALL PASSED'); process.exit(fail ? 1 : 0);
