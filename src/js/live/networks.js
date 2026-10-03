// The networks Takt can play, in picker order. Each one knows how to load
// itself, how to ask for changes, and where its trains are.

import { fi } from './fi.js';
import { hel } from './hel.js';
import { no } from './no.js';
import { se } from './se.js';
import { sto } from './sto.js';
import { bos } from './bos.js';
import { sf } from './sf.js';
import { nyc } from './nyc.js';
import { la } from './la.js';
import { ruter } from './ruter.js';
import { vie } from './vie.js';

export const NETWORKS = { vie, fi, hsl: hel, se, sto, no, ruter, bos, la, nyc, sf };
// Sweden needs an API key (src/js/keys.js) and stays out of the picker without one.
export const ORDER = ['vie', 'fi', 'hsl', 'se', 'sto', 'no', 'ruter', 'bos', 'la', 'nyc', 'sf'].filter(k => NETWORKS[k].enabled !== false);

/** The picker shows countries, alphabetically; under each, the views of its networks, so the
 *  Stockholm metro sits beside Sweden's trains as one more view of Sweden. */
export const COUNTRIES = [
  { key: 'at', name: 'Austria', nets: ['vie'] },
  { key: 'fi', name: 'Finland', nets: ['fi', 'hsl'] },
  { key: 'no', name: 'Norway', nets: ['no', 'ruter'] },
  { key: 'se', name: 'Sweden', nets: ['se', 'sto'] },
  { key: 'us', name: 'United States', nets: ['bos', 'la', 'nyc', 'sf'] },
].map(c => ({ ...c, nets: c.nets.filter(k => ORDER.includes(k)) }))
  .map(c => ({ ...c, views: c.nets.flatMap(k => NETWORKS[k].views) }));
export const countryOf = netKey => COUNTRIES.find(c => c.nets.includes(netKey));

/** The network a view belongs to ('hel' is a view of Finland, 'mal' and 'sk' of Sweden, 'osl' of Norway, 'bay' of San Francisco). */
export const networkOfView = v => ORDER.find(k => NETWORKS[k].views.includes(v)) || 'fi';
