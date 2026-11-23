import * as R from 'react';
import * as RDC from 'react-dom/client';
window.React = R; window.ReactDOM = RDC;
window.lucideReact = new Proxy({}, { get: (_, n) => (p) => R.createElement('svg', { width: p.size || 16, height: p.size || 16, 'data-i': n }) });
window.__RG_SPEED = 8;
