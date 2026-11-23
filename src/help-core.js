/*
 * MYCELIA built-in help. Pure functions, runs in Node and in the browser.
 *
 *   answer(question)                 -> { text, topics:[id,...], intent }   local answer from the user guide, no model
 *   buildMessages(question, history) -> chat messages for an LLM: the guide plus the question (any question is allowed)
 *   TOPICS                           -> [{ id, title, kw, a }]
 */
(function (root) {
  'use strict';
  const TOPICS = [
    { id: 'start', title: 'Getting started', kw: 'start begin new first use intro overview what is mycelia canvas how does this work tour', a: 'MYCELIA is a canvas for research. Papers, datasets, code, notes and experiments are cards, and lines between them show how they relate.\n- **Add source** (top right) puts a new card on the canvas.\n- Drag a card to move it. Scroll or pinch to zoom, drag empty space to pan.\n- **Library** (top left) holds your workspaces, filters and tags.\n- **Agents** (top right) opens the agent team and the Ask AI tab.\n- **Help** is this window. Ask it anything.' },
    { id: 'add', re: /\b(add|upload|import|drop)\b/, title: 'Add a paper, dataset, repo or note', kw: 'add source upload import paper pdf dataset repo repository code note url link drop file new card create', a: 'Click **Add source** in the top bar, then drop or choose a file (PDF, TXT, MD or HTML), paste a web address, or write a note. MYCELIA summarizes it, adds tags and links it to related cards on its own.\n- You can change the title, link, text and tags later with the **⋯** button on the card.' },
    { id: 'link', re: /\b(connect|link|join|wire)\b/, title: 'Connect any two cards', kw: 'connect link join line edge arrow relation relate between nodes cards drag dot port connection wire', a: 'You can link any card to any other card, of any type.\n- **Drag:** every card has four small dots. Drag from a dot onto another card.\n- **Connect mode:** press **Connect** (bottom left, or the **L** key), click one card, then click the card to link it to. It stays on until you press Esc or Done.\n- **Change a link:** click the line to add a label, reverse the arrow or remove it (click Remove twice).\n- Dropping on empty canvas does nothing, and two cards can only be linked once.' },
    { id: 'edit', re: /\b(edit|delete|remove|rename|modify)\b/, title: 'Edit or delete a card', kw: 'edit delete remove rename change title text note paper code link tag modify update trash button', a: 'Paper, note and code cards have a **⋯** button in the top right corner (it shows when you hover or select the card).\n- **Edit** opens a form for the title, a link, your own text and tags. **Ctrl+Enter** saves, **Esc** closes.\n- **Delete** needs a second click ("Click again to delete"). It also removes that card\'s links.\n- Datasets and experiments do not have this button.' },
    { id: 'goal', re: /\b(goal|agents?)\b/, title: 'Give the agent team a goal', kw: 'goal agent agents team task ask controller literature reviewer writer environment setup experiment simulator create notes list work do prompt', a: 'Open **Agents**, type a goal in the box and press Enter. The Controller sends it to the right agent:\n- **Literature Reviewer** finds related papers ("Review related work on retrieval").\n- **Environment Setup** adds a repo and the steps to run it ("Set up rag-eval-harness").\n- **Experiment Simulator** runs simulated ablations ("Run an ablation on learning rate: 1e-4, 3e-4").\n- **Writer** writes notes ("create 5 notes of fastest train in india", "a list of 10 anime").\nResults appear as cards on the canvas.' },
    { id: 'approve', re: /\b(approv\w*|reject)\b/, title: 'Approve or reject agent work', kw: 'approve approval reject accept review auto automatic manual needs review proposal pending permission', a: 'Auto-approve is **on by default**, so agent work is added to the canvas for you. To decide yourself, switch off **Auto-approve agent work** in the Agents panel, then use the **Needs review** tab to approve or reject each proposal.' },
    { id: 'ai', title: 'The AI chip says "not available"', kw: 'ai not available claude model chip permission allow works nothing happens placeholder writer broken error fail unavailable connect', a: 'The Writer and the Ask AI tab use Claude when the page you are viewing is allowed to.\n- Click the **AI** chip in the Agents panel to test it, and **allow** the permission box if one appears.\n- If it stays "not available", open the page in the claude.ai web app. Some views do not give pages access to Claude.\n- Without Claude, the Writer still adds **placeholder** notes you can fill in with Edit, and Ask AI answers from the cards on your canvas. The other agents are simulated either way.' },
    { id: 'experiments', title: 'Experiments and what-if', kw: 'experiment what-if whatif slider simulate run ablation accuracy latency parameter learning rate results save compare', a: 'Select an experiment card to open the **what-if** panel. Move the sliders to change parameters and see the predicted accuracy and latency, then save the run to keep it in the history.\n- These numbers are **simulated predictions**, not measured results. The page labels them that way.' },
    { id: 'timeline', title: 'Replay the map (Timeline)', kw: 'timeline replay history play step evolve undo rewind how built', a: 'Press **Timeline** (bottom left) to replay how the map was built, step by step. Use Start, Back, Play, Next and Now, or the keys **Space** (play), the **arrow keys** and **Home / End**.' },
    { id: 'cluster', title: 'Auto-Cluster', kw: 'cluster group organize arrange layout tidy topic ungroup', a: 'Press **Cluster** in the top bar to group cards by topic. Press **Ungroup** (the same button) to put them back.' },
    { id: 'workspaces', title: 'Workspaces, search and filters', kw: 'workspace workspaces search find filter tag tags type library sidebar switch project', a: 'Open **Library** (top left). Click a workspace to switch, or **+** to make a new one. Press **/** to search all workspaces. Click a type (Papers, Datasets, Code, Notes, Experiments) or a tag to filter the canvas.' },
    { id: 'export', re: /\b(export|download)\b/, title: 'Export your work', kw: 'export download save markdown json share report copy', a: 'Press **Export** in the top bar and choose Markdown or JSON. Your work is also saved automatically in this browser.' },
    { id: 'sync', title: 'Saving and sync', kw: 'sync save saved saving database sqlite local storage offline status synced lost backup server', a: 'Changes are saved on every edit, in this browser. The pill in the top bar shows the sync status. When you run the project\'s own server (`node server.js`), it also syncs to a local SQLite database file, so your work survives clearing the browser. Edits and deletes sync too.' },
    { id: 'ask', title: 'Ask AI about your canvas', kw: 'ask ai question query search answer chat cite citation canvas about', a: 'Open **Agents**, then the **Ask AI** tab, and type a question about your cards ("Which experiment performs best?", "What is missing?"). Answers cite the cards they use as numbered buttons, and clicking one highlights it on the canvas.' },
    { id: 'keys', title: 'Keyboard shortcuts', kw: 'keyboard shortcut shortcuts key keys hotkey press', a: '- **+ / -** zoom in and out, **0** fit to screen\n- **L** Connect mode, **/** search\n- **Esc** close a window or cancel linking\n- **Ctrl+Enter** save in the Edit form\n- Timeline: **Space** play, **arrow keys** step, **Home / End** jump' },
    { id: 'demo', title: 'Reset to the demo', kw: 'demo reset sample example restore start over scenario', a: 'Press **Demo** in the top bar to reload the three sample workspaces and replay how the map was built. This replaces what is on the canvas, so export first if you want to keep it.' }
  ];

  const STOP = new Set('a an and the of for on in to with me my is are be do does did can could please how what which who why when where i you your it its at by as or if then than this that these those there here have has had any all some about from into use using get got want need make'.split(' '));
  const stem = w => w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
  const tokens = s => (String(s || '').toLowerCase().match(/[a-z0-9][a-z0-9+-]*/g) || []).map(stem).filter(w => w.length > 1 && !STOP.has(w));

  const NOUNS = new Set('paper dataset repo repository code note card node source file notes cards nodes'.split(' '));
  let qraw = '';
  function score(t, qt) {
    const title = new Set(tokens(t.title)), kw = new Set(tokens(t.kw));
    let s = 0; qt.forEach(w => { const f = NOUNS.has(w) ? 0.25 : 1; if (title.has(w)) s += 3 * f; if (kw.has(w)) s += 2 * f; });
    if (t.re && t.re.test(String(qraw))) s += 4;
    return s;
  }

  function answer(question) {
    const q = String(question || '').trim(), qt = tokens(q); qraw = q.toLowerCase();
    if (/^(hi|hello|hey|help|hola|namaste)\b[\s!.?]*$/i.test(q)) return { text: 'Hi! Ask me how to do something in MYCELIA, for example **how do I connect two cards?** or **how do I edit a note?** You can pick a topic below too.', topics: [], intent: 'hello' };
    const ranked = TOPICS.map(t => ({ t, s: score(t, qt) })).filter(x => x.s >= 2).sort((a, b) => b.s - a.s);
    if (!ranked.length) return { text: 'I do not have a built-in answer for that. Built-in help only covers how to use MYCELIA, and no AI model is connected right now to answer anything else. Try one of the topics below, or check the **AI** chip in the Agents panel.', topics: [], intent: 'none' };
    const top = ranked[0], also = ranked.slice(1, 3).filter(x => x.s >= top.s * 0.7);
    return { text: '**' + top.t.title + '**\n' + top.t.a + (also.length ? '\n\nAlso see: ' + also.map(x => x.t.title).join(', ') + '.' : ''), topics: [top.t.id].concat(also.map(x => x.t.id)), intent: 'topic' };
  }

  function guide() { return TOPICS.map(t => '## ' + t.title + '\n' + t.a).join('\n\n'); }

  function buildMessages(question, history) {
    const system = 'You are the built-in assistant of MYCELIA, a node-canvas research workspace. Answer any question the person asks, helpfully and concisely: a few sentences or a short list. ' +
      'For questions about using MYCELIA, rely on the user guide below and name the exact buttons. Do not invent buttons or features that the guide does not mention; if the guide does not cover it, say so and suggest the closest thing. ' +
      'For anything else (research, writing, code, general knowledge), just answer it well. Use **bold** for button names. Do not use headings.\n\nUSER GUIDE\n' + guide();
    const msgs = [{ role: 'system', content: system }];
    (history || []).slice(-6).forEach(h => { if (h && (h.role === 'user' || h.role === 'assistant') && h.text) msgs.push({ role: h.role, content: String(h.text).slice(0, 1200) }); });
    msgs.push({ role: 'user', content: String(question || '').slice(0, 800) });
    return msgs;
  }

  const api = { TOPICS, answer, buildMessages, guide, tokens };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.RGHelp = api;
})(typeof self !== 'undefined' ? self : this);
