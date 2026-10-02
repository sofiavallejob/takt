// Static configuration: nothing here depends on the live data.

/** Train categories. Colours and dot weights are fixed; `types` are the
 *  Digitraffic train type codes that fall into each one. */
export const CATS = [
  { name: 'Pendolino', col: '#d62839', w: 1.9, types: ['S'] },
  { name: 'InterCity', col: '#ee8a00', w: 1.7, types: ['IC'] },
  { name: 'Night train', col: '#6a5acd', w: 1.7, types: ['PYO'] },
  { name: 'Regional', col: '#0e9784', w: 1.3, types: ['H', 'HDM', 'MV'] },
  { name: 'Commuter', col: '#2b7bd6', w: 1.1, types: ['HL', 'HV'] },
];

/** The harmony moves one step every real hour. `pcs` are pitch classes:
 *  root, third, fifth, then two colours. */
export const CHORDS = [
  { name: 'D major', root: 50, pcs: [2, 6, 9, 4, 11] },
  { name: 'B minor', root: 47, pcs: [11, 2, 6, 1, 9] },
  { name: 'G major', root: 43, pcs: [7, 11, 2, 9, 4] },
  { name: 'A major', root: 45, pcs: [9, 1, 4, 11, 6] },
];

export const LO = 45, HI = 81;            // A2 to A5, the range lines are tuned into
export const RENDER_LO = LO - 12, RENDER_HI = HI + 13; // buffers rendered for playback
export const BPM = 96;
export const STEP = 60 / BPM / 4;         // sixteenth notes: an arpeggio grid
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];


/** Advanced-panel defaults. Every key is also the id of its input. */
export const FX_DEFAULTS = {
  dens: 0.8, vol: 0.75,
  fxVerb: 0.32, fxEcho: 0.28, fxFb: 0.32,
  fxBright: 5200, fxBody: 5, fxBed: 1, fxSour: 100,
};

/** The map views. Bounds are in degrees; they are projected at load. */
export const VIEWS = {
  fi: {
    name: 'Finland',
    cities: ['HKI', 'TPE', 'TKU', 'OL', 'KUO', 'JY', 'ROI', 'JNS', 'VS', 'LH', 'SK', 'KV', 'PRI', 'KAJ', 'KLI'],
    small: ['KV', 'PRI', 'KAJ', 'SK', 'LH'],
  },
  sto: {
    name: 'Stockholm metro',
    box: [17.86, 59.215, 18.13, 59.42],
    cities: ['T-Centralen', 'Slussen', 'Gullmarsplan', 'Hässelby strand', 'Farsta strand', 'Skarpnäck',
      'Hagsätra', 'Akalla', 'Hjulsta', 'Mörby centrum', 'Norsborg', 'Fruängen', 'Ropsten', 'Liljeholmen', 'Alvik'],
    small: ['Liljeholmen', 'Gullmarsplan', 'Alvik'],
  },
  se: {
    name: 'Sweden',
    box: [11.0, 55.3, 24.2, 68.5],
    cities: ['Cst', 'G', 'Mc', 'U', 'Lp', 'Ör', 'Gä', 'Suc', 'Uå', 'Ös', 'Le', 'Kmb', 'Ksc', 'Jö', 'Hb', 'Kac', 'No.nk'],
    small: ['U', 'Lp', 'Ör', 'Gä', 'Ksc', 'Jö', 'Hb', 'Kac', 'No.nk'],
  },
  mal: {
    name: 'Mälardalen',
    box: [15.0, 58.6, 18.9, 60.4],
    cities: ['Cst', 'U', 'Vå', 'Ör', 'Et', 'Nk', 'Arnc', 'Sl', 'Ep', 'Hpbg', 'K', 'Söc', 'Nyc', 'Bål'],
    small: ['Sl', 'Ep', 'Hpbg', 'Nyc', 'Bål', 'Söc'],
  },
  sk: {
    name: 'Skåne',
    box: [12.3, 55.3, 14.6, 56.6],
    cities: ['Mc', 'Lu', 'Hb', 'Cr', 'Y', 'Trg', 'Hm', 'Lkö', 'Ä', 'Dk.kh'],
    small: ['Trg', 'Lkö', 'Ä', 'Y'],
  },
  hel: {
    name: 'Helsinki',
    box: [24.4, 60.1, 25.3, 60.77],        // lon0, lat0, lon1, lat1
    cities: ['HKI', 'PSL', 'TKL', 'LEN', 'KE', 'JP', 'RI', 'LPV', 'EPO', 'KKN', 'HY'],
    small: ['PSL', 'LEN', 'EPO', 'HY'],
  },
};

/** Nicer names for a few stations whose official short names are long. */
export const CITY_NAMES = {
  HKI: 'Helsinki', TPE: 'Tampere', TKU: 'Turku', OL: 'Oulu', KUO: 'Kuopio',
  JY: 'Jyväskylä', ROI: 'Rovaniemi', JNS: 'Joensuu', VS: 'Vaasa', LH: 'Lahti',
  SK: 'Seinäjoki', KV: 'Kouvola', PRI: 'Pori', KAJ: 'Kajaani', KLI: 'Kolari',
  PSL: 'Pasila', TKL: 'Tikkurila', LEN: 'Airport', KE: 'Kerava', JP: 'Järvenpää',
  RI: 'Riihimäki', LPV: 'Leppävaara', EPO: 'Espoo', KKN: 'Kirkkonummi', HY: 'Hyvinkää',
  KLH: 'Kauklahti',
};

/** Commuter line letters that are one string. The ring line runs as I one way
 *  and P the other, over the same track. */
export const LINE_ALIASES = { I: 'I/P', P: 'I/P' };
export const LINE_NAMES = { 'I/P': 'Ring Rail' };

export const CREDITS_FI = `<h3>Finland, live</h3><ul>
  <li>Trains, timetables, actual and estimated times, cancellations: <a href="https://www.digitraffic.fi/en/railway-traffic/">Fintraffic / digitraffic.fi</a> (CC BY 4.0)</li>
  <li>Train GPS positions: digitraffic.fi train locations (CC BY 4.0)</li>
  <li>Station coordinates: digitraffic.fi station metadata (CC BY 4.0)</li>
  <li>Regions: <a href="https://www.geoboundaries.org">geoBoundaries</a> FIN ADM1, from OpenStreetMap (ODbL)</li>
  <li>Routes are drawn through every timetable point a train passes, so they follow the track at station spacing, not at survey precision.</li></ul>`;

export const CREDITS_SE = `<h3>Sweden, live</h3><ul>
  <li>Trains, timetables, estimated and actual times, cancellations, GPS positions and stations: <a href="https://data.trafikverket.se">Trafikverket open API</a></li>
  <li>Regions: <a href="https://www.geoboundaries.org">geoBoundaries</a> SWE ADM1, from OpenStreetMap (ODbL)</li>
  <li>Routes are drawn station to station, not along the track. Replacement buses are left out.</li></ul>`;

export const CREDITS_STO = `<h3>Stockholm metro, live</h3><ul>
  <li>Live trip updates and vehicle positions: <a href="https://www.trafiklab.se/api/gtfs-datasets/gtfs-sweden/">GTFS Sweden 3 Realtime</a>, Samtrafiken via Trafiklab (CC0)</li>
  <li>Timetable and stations: GTFS Sweden 3 static data, Samtrafiken via Trafiklab (CC0), cut to the tunnelbana once a day</li>
  <li>Municipal outlines: <a href="https://www.geoboundaries.org">geoBoundaries</a> SWE ADM2, from OpenStreetMap (ODbL)</li>
  <li>Lines are drawn station to station, not along the tunnels.</li></ul>`;

export const CREDITS_GENERAL = `<h3>Credits</h3>
  <p>Built by Sofia Vallejo Budziszewski as part of doctoral research at the
  <a href="https://iem.kug.ac.at">Institute of Electronic Music and Acoustics (IEM)</a>,
  University of Music and Performing Arts Graz.</p>
  <p>Inspired by Alexander Chen's <a href="http://mta.me">Conductor</a> and
  Joshua Wolk's <a href="https://www.trainjazz.com">Train Jazz</a>.</p>`;
