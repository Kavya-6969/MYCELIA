# ResearchGraph: ingestion (Step 2) and agent team (Step 3)

```
node server.js                       # http://localhost:3000, built-in mock AI
GROQ_API_KEY=...   node server.js    # Groq, llama-3.3-70b-versatile (GROQ_MODEL to change)
OPENAI_API_KEY=... node server.js    # OpenAI, gpt-4o-mini (OPENAI_MODEL, OPENAI_BASE_URL)
node test/api.test.js                # ingest endpoint tests (server must be running)
node test/agents.test.js             # agent engine tests (no server needed)
python3 build.py                     # writes dist/artifact.html, a single-file build with the core inlined
```
No npm dependencies. Node 18+. PDF text uses `pdftotext` (poppler) when installed, else a built-in extractor.

## POST /api/ingest

Request (JSON):

| field | notes |
|---|---|
| `kind` | `"file"`, `"url"` or `"text"` |
| `filename`, `data` | file uploads: name and base64 body (PDF, TXT, MD, HTML, up to 15 MB) |
| `url` | http(s) page, arXiv abstract or direct PDF link. Private and loopback addresses are blocked |
| `text` | pasted note. A single short line becomes the title |
| `type` | `paper`, `dataset`, `code` or `note` (default: paper, or note for text) |
| `nodes` | existing canvas nodes `{id,title,tags,topic,x,y,...}`, used for linking and placement |
| `viewCenter` | `{x,y}` in canvas coordinates, used when there is nothing to link to |

Response:

```json
{
  "ok": true,
  "source": { "kind": "file", "name": "sample.pdf", "chars": 1204 },
  "ai": { "provider": "mock", "model": "heuristic-v1", "fallback": null },
  "node": { "id": "in_...", "type": "paper", "title": "...", "authors": ["..."], "meta": "...",
            "summary": "3 sentences", "findings": ["..."], "tags": ["transformer", "nlp"],
            "topic": "Models", "preview": "first 600 chars", "x": 360, "y": -215 },
  "edges": [ { "id": "...", "source": "<new id>", "target": "<existing id>", "score": 0.48, "reason": "Shared tags: #nlp" } ],
  "cluster": { "topic": "Models", "size": 3 }
}
```
Errors return `{ "ok": false, "error": "..." }` with 400 (bad input), 413 (too large), 415 (unsupported type), 422 (no readable text) or 502 (fetch failed).

## How it works
- **Parse** (`src/ingest-core.js`): title and authors from PDF metadata, HTML `citation_*` meta tags or the first lines of text.
- **Summarise and tag**: LLM call (JSON mode) when a key is set; otherwise, or if the call fails, an extractive summary plus a topic lexicon.
- **Link**: TF-IDF cosine over title, tags, topic and summary, plus bonuses for shared tags. Top 3 above a threshold become edges.
- **Place**: weighted centroid of the linked nodes, then the nearest free slot so cards never overlap.
- The browser runs the same core when no server answers, so the modal also works from the single-file build, except URL fetching.

# Agent team (Step 3)

`src/agent-core.js` is one engine used in two places: `server.js` runs it and streams events over SSE, and the page runs the same file when no server answers (the sidebar shows which one in the top-right chip).

```
You ──goal──▶ Controller ──routes──▶ Literature Reviewer   suggests papers, links them to related nodes
                                  ├▶ Environment Setup     inspects a code node, proposes setup commands and a checklist note
                                  └▶ Experiment Simulator  designs configs, runs a seeded simulation, proposes a results note
```

**Routing.** The Controller scores the goal against keywords for each specialist and runs the matches in a fixed order (literature, setup, experiment). Goals that match several run as a pipeline.

**Approval gate.** Thoughts and steps stream freely. Anything that runs an action or adds a node calls `gate()`, which pauses the agent and emits a proposal. Nothing continues until `decide(id, approve)`. Spawn proposals appear on the canvas as dashed ghost nodes until you decide. Execution is simulated: nothing runs on your machine.

**Scores** (start 50, shown as a badge, tiers Trusted 70+, Stable 40+, At risk, Retired):

| event | change |
|---|---|
| node approved | +10 |
| action approved | +4 |
| task completed with something approved | +2 |
| node rejected / action rejected | -8 / -5 |
| task failed or crashed | -12 |

A specialist at 20 or below is retired: the Controller skips it and the card shows Reinstate (back to 35). The Controller scores +2 for a goal that delivers and -4 for one where every task fails. Failures come from real conditions (no code node to set up, no dataset to run on, no paper match) plus a seeded 12% simulated crash during experiment runs.

**Endpoints**

| | |
|---|---|
| `GET /api/agents/stream` | SSE. First message is a `snapshot`, then `agent`, `log`, `proposal`, `score`, `goal` events |
| `POST /api/agents/goal` | `{ goal, wsId, nodes }` -> `{ ok, goalId }` |
| `POST /api/agents/decision` | `{ proposalId, approve }` |
| `POST /api/agents/reinstate` | `{ agentId }` |
| `GET /api/agents` | current scores and pending proposals |

Statuses: idle, running, waiting (for approval), complete, plus failed and retired. Each step and thought carries a confidence, shown on the agent card and in the feed.

## Step 4: Experiments, What-If analysis, Export

**Experiment node.** A fifth node type (rose accent) holding a model, a dataset, six hyperparameters (learning rate, batch size, layers, hidden size, epochs, dropout), a baseline, and predicted metrics (accuracy, latency, training time, GPU memory). The card shows accuracy and the change against baseline.

**What-if drawer.** Click an experiment node (without dragging) to open a slide-over. Each parameter has a slider and a text field (learning rate accepts `3e-4`). Deltas update live: accuracy, latency, training time, GPU memory and validation loss, plus a validation curve against the baseline and warnings (out of memory, too few steps, overfitting). Presets (Baseline, Fast, Accurate), Auto-tune (grid search of 2,400 settings within the 24 GB budget), Reset, and Save run (stores the setting on the node and updates the card). Esc closes it.

**Simulator.** `src/experiment-core.js` is a closed-form model, not real training: a Gaussian learning-rate optimum that scales with batch size, saturating capacity from layers and hidden size, convergence from optimiser steps, overfitting reduced by dropout, a memory estimate including activations, and a latency formula. It is deterministic per seed and labelled "simulated" everywhere, including exports.

**Agent sweeps.** Goals such as "Sweep learning rate on Natural Questions" make the Experiment Simulator run each value (gated as an action), then propose an Experiment node (gated as a node). Other experiment goals keep the Step 3 behaviour.

**Export.** The Export button builds Markdown or JSON from the current workspace: notes, sources, relationships (list plus a Mermaid graph), experiments (parameter and metric tables, warnings, saved runs) and optionally the agent team. Pending ghost nodes are excluded. Copy always works; Download works when the app is opened at top level (`node server.js`), not inside the published preview frame. JSON uses schema `researchgraph.workspace/1`.

| | |
|---|---|
| `POST /api/experiments/simulate` | `{ params, baseline?, seed? }` -> metrics and deltas |
| `POST /api/export` | `{ workspace, agents?, format, scope }` -> exported document |

Tests: `npm run test:experiment`, `npm run test:export`.

## Step 5: Offline-first sync, replayable timeline, comparison

**Offline-first storage.** Every workspace (nodes, edges, notes, experiments, regions and the change log) is cached in the browser (`localStorage`, key `researchgraph.workspace.v1`) a fraction of a second after each change, and restored on load. Pending ghost nodes from the agent approval gate are not saved. If storage is blocked, the app keeps working in memory and says so in the sync popover.

**Status pill.** The header pill shows `Online · Synced`, `Online · Syncing…`, `Online · N to sync` or `Offline · N changes saved on device`. Click it for details: where data is saved, the sync target, last sync, queue size, a **Simulate offline** switch (so you can try offline mode without DevTools), **Sync now**, and **Reset this device**. The browser's own online/offline events drive it, and so does a failed request to the server. When the connection returns, the queue is sent automatically.

**Sync.** With `node server.js` the client pushes a snapshot to `POST /api/sync` (stored in a local SQLite database at `data/researchgraph.db`, override with `RG_DB_FILE`; needs Node 22.5 or newer, otherwise it falls back to `data/sync.json`; an existing `sync.json` is imported once). If another device has synced since (`baseRev` is stale), the server merges: nodes and edges are unioned by id, the newer edit to each card wins, deletions are kept as tombstones so they do not come back, and the change log is merged. The client adopts the merged result. `GET /api/sync` returns the latest snapshot. Without a server (the published page, or `file://`), "Saved" means stored in this browser; nothing is sent anywhere.

**Local database.** Besides the full snapshot, the database keeps `workspaces`, `nodes` and `edges` tables you can query with any SQLite tool (`sqlite3 data/researchgraph.db "select title, type from nodes"`), plus a `sync_log` of the last 200 syncs. `GET /api/db` returns the engine, file, row counts and the latest syncs. Load Demo clears it.

**Timeline.** Click **Timeline** (bottom left of the canvas). The slider steps through the history of the open workspace: sources added (with the links they created), agent-added nodes, agent goals finishing, experiment nodes and saved runs, linking, clustering. Nodes and edges that did not exist yet are hidden; the current step is highlighted and the camera pans to it. Controls: first, back, play/pause, forward, now; keyboard Left/Right, Home/End, Space, Esc. Dragging is disabled while replaying. Starting an action (Add Source, a goal, Cluster) returns to the live map.

Changes are detected by diffing the workspace, so every feature feeds the timeline without extra wiring. Dragging, renaming and parameter tweaks are saved but are not timeline steps. The three demo workspaces ship with a **sample history** (marked with a "Sample history" tag) so there is something to replay on day one; anything you do is recorded for real with real timestamps. Cards show their current values, not their values at that step, and nodes you delete are not redrawn during replay.

**Why ResearchGraph?** The header button opens a comparison of this approach against tab-heavy research (where things live, linking, agents, approval, what-if, history, offline, sharing), plus a short note on where tabs still win.

| | |
|---|---|
| `GET /api/sync` | `{ rev, updatedAt, snapshot }` |
| `POST /api/sync` | `{ baseRev, snapshot }` -> `{ rev, merged, snapshot? }` |

Tests: `npm run test:sync`; `BASE=http://localhost:3000 node test/sync-api.test.js`; `node test/sync-ui.test.js <url> <tag> [w] [h]` (Playwright: timeline, offline, reload, resync, comparison, overflow).


## Ask AI

The **Ask AI** tab in the right panel is a chat column for questions about the open workspace. Answers cite the nodes they use as numbered chips; click one to highlight the node on the canvas. With no model key, answers come from a local search over your nodes (`src/ask-core.js`) and are labelled "From your canvas". With `GROQ_API_KEY` or `OPENAI_API_KEY` set on the server, `POST /api/ask` sends the question plus a compact view of the workspace to the model and labels the reply "AI model". Chats are saved per workspace in the browser.


## Writer agent

A goal that no specialist recognises, or that is an explicit writing request ("give me a list of 10 anime", "summarize this workspace"), goes to the **Writer** agent. It asks an AI model to write the content and adds it to the canvas as an **AI Note** that shows its text on the card. In the published page the model is Claude, through the viewer's `sample` capability (the page asks the viewer's permission on first use). With `node server.js` it uses `GROQ_API_KEY` or `OPENAI_API_KEY`. With no model connected, the Controller says so and falls back to starter papers. The "Add AI notes automatically" switch under the goal box skips the Approve step for Writer notes; other agents still wait for approval. AI notes are labelled as AI-generated, so check the facts.
