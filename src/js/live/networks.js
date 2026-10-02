// The networks Takt can play, in picker order. Each one knows how to load
// itself, how to ask for changes, and where its trains are.

import { fi } from './fi.js';
import { se } from './se.js';
import { sto } from './sto.js';

export const NETWORKS = { fi, se, sto };
// Sweden needs an API key (src/js/keys.js) and stays out of the picker without one.
export const ORDER = ['fi', 'se', 'sto'].filter(k => NETWORKS[k].enabled !== false);

/** The picker shows countries; under each, the views of its networks, so the
 *  Stockholm metro sits beside Sweden's trains as one more view of Sweden. */
export const COUNTRIES = [
  { key: 'fi', name: 'Finland', nets: ['fi'] },
  { key: 'se', name: 'Sweden', nets: ['se', 'sto'] },
].map(c => ({ ...c, nets: c.nets.filter(k => ORDER.includes(k)) }))
  .map(c => ({ ...c, views: c.nets.flatMap(k => NETWORKS[k].views) }));
export const countryOf = netKey => COUNTRIES.find(c => c.nets.includes(netKey));

/** The network a view belongs to ('hel' is a view of Finland, 'mal' and 'sk' of Sweden). */
export const networkOfView = v => ORDER.find(k => NETWORKS[k].views.includes(v)) || 'fi';
