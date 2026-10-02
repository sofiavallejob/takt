// The networks Takt can play, in picker order. Each one knows how to load
// itself, how to ask for changes, and where its trains are.

import { fi } from './fi.js';
import { se } from './se.js';
import { sto } from './sto.js';

export const NETWORKS = { fi, se, sto };
// Sweden needs an API key (src/js/keys.js) and stays out of the picker without one.
export const ORDER = ['fi', 'se', 'sto'].filter(k => NETWORKS[k].enabled !== false);

/** The network a view belongs to ('hel' is a view of Finland, 'mal' and 'sk' of Sweden). */
export const networkOfView = v => ORDER.find(k => NETWORKS[k].views.includes(v)) || 'fi';
