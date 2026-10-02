// The networks Takt can play, in picker order. Each one knows how to load
// itself, how to ask for changes, and where its trains are.

import { fi } from './fi.js';
import { sto } from './sto.js';

export const NETWORKS = { fi, sto };
export const ORDER = ['fi', 'sto'];

/** The network a view belongs to ('hel' is a view of Finland). */
export const networkOfView = v => ORDER.find(k => NETWORKS[k].views.includes(v)) || 'fi';
