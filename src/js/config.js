// Static configuration: nothing here depends on the loaded data.

/** Train categories. Colours and dot weights are fixed; `types` are the
 *  Digitraffic train type codes that fall into each one. Replay packs name
 *  their own categories (`C.cats`) in the same five slots. */
export const CATS = [
  { name: 'Pendolino', col: '#d62839', w: 1.9, types: ['S'] },
  { name: 'InterCity', col: '#ee8a00', w: 1.7, types: ['IC'] },
  { name: 'Night train', col: '#6a5acd', w: 1.7, types: ['PYO'] },
  { name: 'Regional', col: '#0e9784', w: 1.3, types: ['H', 'HDM', 'MV'] },
  { name: 'Commuter', col: '#2b7bd6', w: 1.1, types: ['HL', 'HV'] },
];

/** The harmony moves one step every hour of the clock (real, or replayed). `pcs` are pitch classes:
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
  fxBright: 5200, fxBody: 5, fxBed: 1, fxSour: 100, fxDist: 0.8,
};

/** The map views. Bounds are in degrees; they are projected at load. */
export const VIEWS = {
  fi: {
    name: 'Finland',
    cities: ['HKI', 'TPE', 'TKU', 'OL', 'KUO', 'JY', 'ROI', 'JNS', 'VS', 'LH', 'SK', 'KV', 'PRI', 'KAJ', 'KLI'],
    small: ['KV', 'PRI', 'KAJ', 'SK', 'LH'],
  },
  sto: {
    name: 'Stockholm metro & tram',
    box: [17.82, 59.2, 18.25, 59.42],
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
  no: {
    name: 'Norway',
    box: [4.6, 57.9, 19.5, 68.6],
    cities: ['Oslo S', 'Bergen', 'Trondheim S', 'Stavanger', 'Kristiansand', 'Bodø', 'Lillehammer', 'Hamar',
      'Drammen', 'Skien', 'Halden', 'Åndalsnes', 'Røros', 'Mo i Rana', 'Steinkjer', 'Dombås', 'Narvik'],
    small: ['Hamar', 'Drammen', 'Skien', 'Halden', 'Åndalsnes', 'Steinkjer', 'Dombås'],
  },
  osl: {
    name: 'Oslo region',
    box: [9.9, 59.25, 11.6, 60.45],
    cities: ['Oslo S', 'Oslo lufthavn', 'Lillestrøm', 'Drammen', 'Asker', 'Ski', 'Moss', 'Eidsvoll',
      'Jessheim', 'Sandvika', 'Spikkestad', 'Kongsberg', 'Tønsberg', 'Hønefoss'],
    small: ['Sandvika', 'Spikkestad', 'Jessheim', 'Asker'],
  },
  hsl: {
    name: 'Helsinki metro & tram',
    box: [24.63, 60.135, 25.2, 60.255],
    cities: ['Rautatientori', 'Kamppi', 'Itäkeskus', 'Vuosaari', 'Mellunmäki', 'Tapiola', 'Kivenlahti',
      'Keilaniemi', 'Pasilan asema', 'Kalasatama', 'Arabianranta', 'Hakaniemi', 'Ruoholahti', 'Herttoniemi'],
    small: ['Arabianranta', 'Hakaniemi', 'Ruoholahti', 'Kalasatama', 'Keilaniemi', 'Herttoniemi'],
  },
  bos: {
    name: 'Boston',
    box: [-71.27, 42.2, -70.97, 42.445],
    cities: ['Park Street', 'Harvard', 'Alewife', 'Braintree', 'Ashmont', 'Mattapan', 'Forest Hills', 'Oak Grove',
      'Wonderland', 'Kenmore', 'Boston College', 'Riverside', 'Heath Street', 'Medford/Tufts', 'Airport', 'Quincy Center'],
    small: ['Kenmore', 'Heath Street', 'Airport', 'Quincy Center', 'Mattapan'],
  },
  nyc: {
    name: 'New York',
    box: [-74.26, 40.5, -73.74, 40.91],
    cities: ['Times Sq-42 St', 'Grand Central-42 St', 'Fulton St', 'Atlantic Av-Barclays Ctr', 'Van Cortlandt Park-242 St',
      'Inwood-207 St', 'Wakefield-241 St', 'Pelham Bay Park', 'Flushing-Main St', 'Jamaica Center-Parsons/Archer',
      'Far Rockaway-Mott Av', 'Coney Island-Stillwell Av', 'Bay Ridge-95 St', 'Canarsie-Rockaway Pkwy',
      'Astoria-Ditmars Blvd', 'Forest Hills-71 Av', 'St George', 'Tottenville'],
    small: ['Grand Central-42 St', 'Fulton St', 'Pelham Bay Park', 'Canarsie-Rockaway Pkwy', 'Astoria-Ditmars Blvd',
      'Forest Hills-71 Av', 'Bay Ridge-95 St'],
  },
  la: {
    name: 'Los Angeles',
    box: [-118.62, 33.72, -117.7, 34.33],
    cities: ['Union Station', '7th Street / Metro Center Station', 'Downtown Long Beach Station', 'Downtown Santa Monica Station',
      'North Hollywood Station', 'Pomona North Station', 'LAX / Metro Transit Center', 'Redondo Beach Station',
      'Atlantic Station', 'Norwalk Station', 'Hollywood / Highland Station', 'Culver City Station', 'Memorial Park Station',
      'Downtown Inglewood Station'],
    small: ['7th Street / Metro Center Station', 'Hollywood / Highland Station', 'Culver City Station',
      'Downtown Inglewood Station', 'Atlantic Station', 'Memorial Park Station'],
  },
  sf: {
    name: 'San Francisco',
    box: [-122.515, 37.7, -122.375, 37.815],
    cities: ['Embarcadero Station', 'Powell Station', 'Civic Center Station', 'Castro Station', 'West Portal Station',
      'Judah/La Playa/Ocean Beach', 'Wawona/46th Ave /Sf Zoo', 'Balboa Park', 'Glen Park', '24th Street / Mission',
      'Chinatown - Rose Pak Station', 'Daly City'],
    small: ['Civic Center Station', 'Castro Station', 'Glen Park', '24th Street / Mission', 'Chinatown - Rose Pak Station'],
  },
  bay: {
    name: 'Bay Area',
    box: [-122.55, 37.33, -121.72, 38.04],
    cities: ['Embarcadero', 'Richmond', 'Antioch', 'Dublin / Pleasanton', 'Berryessa / North San Jose', 'Millbrae',
      'San Francisco International Airport', 'Oakland International Airport', '12th Street / Oakland City Center',
      'Walnut Creek', 'Fremont', 'Daly City', 'Downtown Berkeley'],
    small: ['Walnut Creek', 'Fremont', 'Daly City', 'Downtown Berkeley', 'Oakland International Airport', 'Millbrae'],
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
  KLH: 'Kauklahti', 'Pasilan asema': 'Pasila',
  // San Francisco
  'Embarcadero Station': 'Embarcadero', 'Powell Station': 'Powell', 'Civic Center Station': 'Civic Center',
  'Castro Station': 'Castro', 'West Portal Station': 'West Portal', 'Judah/La Playa/Ocean Beach': 'Ocean Beach',
  'Wawona/46th Ave /Sf Zoo': 'Zoo', '24th Street / Mission': 'Mission', 'Chinatown - Rose Pak Station': 'Chinatown',
  '12th Street / Oakland City Center': 'Oakland', 'Dublin / Pleasanton': 'Dublin', 'Berryessa / North San Jose': 'San José',
  'San Francisco International Airport': 'SFO', 'Oakland International Airport': 'OAK', 'Downtown Berkeley': 'Berkeley',
  // New York
  'Times Sq-42 St': 'Times Square', 'Grand Central-42 St': 'Grand Central', 'Fulton St': 'Fulton St',
  'Atlantic Av-Barclays Ctr': 'Atlantic Av', 'Van Cortlandt Park-242 St': 'Van Cortlandt Park', 'Inwood-207 St': 'Inwood',
  'Wakefield-241 St': 'Wakefield', 'Flushing-Main St': 'Flushing', 'Jamaica Center-Parsons/Archer': 'Jamaica',
  'Far Rockaway-Mott Av': 'Far Rockaway', 'Coney Island-Stillwell Av': 'Coney Island', 'Bay Ridge-95 St': 'Bay Ridge',
  'Canarsie-Rockaway Pkwy': 'Canarsie', 'Astoria-Ditmars Blvd': 'Astoria', 'Forest Hills-71 Av': 'Forest Hills',
  // Los Angeles
  '7th Street / Metro Center Station': '7th St/Metro Center', 'Downtown Long Beach Station': 'Long Beach',
  'Downtown Santa Monica Station': 'Santa Monica', 'North Hollywood Station': 'North Hollywood',
  'Pomona North Station': 'Pomona', 'LAX / Metro Transit Center': 'LAX', 'Redondo Beach Station': 'Redondo Beach',
  'Atlantic Station': 'East LA', 'Norwalk Station': 'Norwalk', 'Hollywood / Highland Station': 'Hollywood',
  'Culver City Station': 'Culver City', 'Memorial Park Station': 'Pasadena', 'Downtown Inglewood Station': 'Inglewood',
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

export const CREDITS_NO = `<h3>Norway, live</h3><ul>
  <li>Trains, timetables, expected and actual times, cancellations: <a href="https://developer.entur.org">Entur</a> journey planner (NLOD)</li>
  <li>Train GPS positions: Entur vehicle positions (NLOD)</li>
  <li>Regions: <a href="https://www.geoboundaries.org">geoBoundaries</a> NOR ADM1, from OpenStreetMap (ODbL)</li>
  <li>Routes are drawn station to station, not along the track.</li></ul>`;

export const CREDITS_HEL = `<h3>Helsinki metro and trams, live</h3><ul>
  <li>Live positions and delays: <a href="https://digitransit.fi/en/developers/apis/5-realtime-api/vehicle-positions/high-frequency-positioning/">HSL high-frequency positioning</a> (CC BY 4.0)</li>
  <li>Timetable and stops: <a href="https://www.hsl.fi/en/hsl/open-data">HSL GTFS</a> (CC BY 4.0), cut to the metro and trams once a day</li>
  <li>Municipal outlines: <a href="https://www.geoboundaries.org">geoBoundaries</a> FIN ADM3, from OpenStreetMap (ODbL)</li>
  <li>Lines are drawn stop to stop; the two platforms of a stop are one point.</li></ul>`;

export const CREDITS_US = `<h3>Boston, Los Angeles, New York and San Francisco, live</h3><ul>
  <li>Boston: vehicle positions, trips and stopping patterns from the <a href="https://www.mbta.com/developers/v3-api">MBTA V3 API</a> (MBTA Developers License)</li>
  <li>Los Angeles: Metro Rail and Metro Bus positions and predictions from the <a href="https://api.metro.net">LA Metro API</a>; stopping patterns from LA Metro's GTFS</li>
  <li>New York: subway and Staten Island Railway predictions from the <a href="https://api.mta.info">MTA GTFS Realtime feeds</a>; stopping patterns from the MTA's GTFS</li>
  <li>San Francisco: BART and Muni GTFS and GTFS Realtime via <a href="https://511.org/open-data/transit">511.org</a>, Metropolitan Transportation Commission; the timetables are cut to the rail lines once a day</li>
  <li>Outlines: US Census Bureau cartographic boundary files (public domain)</li>
  <li>Boston, New York and Los Angeles are placed from where their vehicles are or will next be, along each line's stopping pattern, and are never late. Lines are drawn station to station.</li></ul>`;

export const CREDITS_STO = `<h3>Stockholm metro and trams, live</h3><ul>
  <li>Live trip updates and vehicle positions: <a href="https://www.trafiklab.se/api/gtfs-datasets/gtfs-sweden/">GTFS Sweden 3 Realtime</a>, Samtrafiken via Trafiklab (CC0)</li>
  <li>Timetable and stations: GTFS Sweden 3 static data, Samtrafiken via Trafiklab (CC0), cut to the tunnelbana and the trams once a day</li>
  <li>Municipal outlines: <a href="https://www.geoboundaries.org">geoBoundaries</a> SWE ADM2, from OpenStreetMap (ODbL)</li>
  <li>Lines are drawn station to station, not along the tunnels.</li></ul>`;

/** Mexico City ships one geometry per direction, so the raw feed has 24
 *  polylines for 12 lines. Each entry folds a direction pair into a single
 *  string: `rep` is the polyline the string is drawn and plucked on, `clip`
 *  trims it to one direction where the feed stored an out-and-back loop.
 *  Terminals are the official ones; the feed's own `from`/`to` are whatever
 *  stops the longest surviving trip happened to reach. */
export const MX_LINES = [
  { id: '1',  name: 'Línea 1',  col: '#F04E98', from: 'Observatorio',   to: 'Pantitlán',            geoms: [0, 1],   rep: 0 },
  { id: '2',  name: 'Línea 2',  col: '#005EB8', from: 'Cuatro Caminos', to: 'Tasqueña',             geoms: [4, 5],   rep: 4 },
  { id: '3',  name: 'Línea 3',  col: '#AF9800', from: 'Indios Verdes',  to: 'Universidad',          geoms: [6, 7],   rep: 6 },
  { id: '4',  name: 'Línea 4',  col: '#6BBBAE', from: 'Martín Carrera', to: 'Santa Anita',          geoms: [8, 9],   rep: 9 },
  { id: '5',  name: 'Línea 5',  col: '#FFD100', from: 'Politécnico',    to: 'Pantitlán',            geoms: [10, 11], rep: 10 },
  { id: '6',  name: 'Línea 6',  col: '#DA291C', from: 'El Rosario',     to: 'Martín Carrera',       geoms: [12, 13], rep: 12 },
  { id: '7',  name: 'Línea 7',  col: '#E87722', from: 'El Rosario',     to: 'Barranca del Muerto',  geoms: [14, 15], rep: 14 },
  { id: '8',  name: 'Línea 8',  col: '#009A44', from: 'Garibaldi',      to: 'Constitución de 1917', geoms: [16, 17], rep: 16 },
  { id: '9',  name: 'Línea 9',  col: '#512F2E', from: 'Tacubaya',       to: 'Pantitlán',            geoms: [18, 19], rep: 19 },
  { id: '12', name: 'Línea 12', col: '#B0A32A', from: 'Mixcoac',        to: 'Tláhuac',              geoms: [2, 3],   rep: 3, clip: [0, 46] },
  { id: 'A',  name: 'Línea A',  col: '#981D97', from: 'Pantitlán',      to: 'La Paz',               geoms: [20, 21], rep: 20 },
  { id: 'B',  name: 'Línea B',  col: '#B1B3B3', from: 'Buenavista',     to: 'Ciudad Azteca',        geoms: [22, 23], rep: 22 },
];

/** Replay: per-country data credits for the recorded days. */
export const CREDITS_REPLAY = {
  at: `<h3>Austria, recorded</h3><ul>
    <li>Timetable: Mobilitätsverbünde Österreich national GTFS feed (CC BY 4.0)</li>
    <li>Delays: ÖBB-Infrastruktur AG Zugfahrten (CC BY 3.0 AT)</li>
    <li>Track network: ÖBB GeoNetz</li>
    <li>Borders: <a href="https://github.com/ginseng666/GeoJSON-TopoJSON-Austria">ginseng666/GeoJSON-TopoJSON-Austria</a></li></ul>`,
  ch: `<h3>Switzerland, recorded</h3><ul>
    <li>Timetable: geOps GTFS train feed (geops.ch)</li>
    <li>Actual times: opentransportdata.swiss Ist-Daten archive</li>
    <li>Track network: Federal Office of Transport Schienennetz (data.geo.admin.ch)</li>
    <li>Borders: <a href="https://github.com/codeforgermany/click_that_hood">codeforgermany/click_that_hood</a></li></ul>`,
  de: `<h3>Germany, recorded</h3><ul>
    <li>Delays: <a href="https://github.com/piebro/deutsche-bahn-data">piebro/deutsche-bahn-data</a> (CC BY 4.0, from the DB Timetable API)</li>
    <li>Track network: DB InfraGO Infrastrukturdaten (GeoZG)</li>
    <li>Station coordinates: Trainline open station list</li>
    <li>Borders: <a href="https://github.com/isellsoap/deutschlandGeoJSON">isellsoap/deutschlandGeoJSON</a></li></ul>`,
  nl: `<h3>Netherlands, recorded</h3><ul>
    <li>Timetable and punctuality: <a href="https://www.rijdendetreinen.nl/open-data">Rijden de Treinen</a> service archive (CC BY 4.0)</li>
    <li>Station coordinates: Rijden de Treinen station list</li>
    <li>Track network: OpenStreetMap running lines, via the Overpass API (ODbL)</li>
    <li>Borders: <a href="https://cartomap.github.io/nl/">cartomap.github.io/nl</a> province outlines (CBS)</li></ul>`,
  mx: `<h3>Mexico City metro, recorded</h3><ul>
    <li>Track geometry: OpenStreetMap (STC Metro relations), via the Overpass API</li>
    <li>Station names: OpenStreetMap</li>
    <li>Timetable: STC Metro GTFS from datos.cdmx.gob.mx (CC BY, via SEMOVI)</li>
    <li>The feed carries no service for Línea 12, so it has no trains. The string is still there to play by hand.</li></ul>`,
};

export const CREDITS_GENERAL = `<h3>Sonification</h3>
  <p>Each route is a string tuned by its length. Trains pluck the lines they cross;
  the note you hear belongs to the line being crossed, not to the train's own line.
  In <em>chord</em> tuning the strings are snapped to a chord that moves every hour
  (D, Bm, G, A). In <em>harmonics</em> tuning each string sounds at the frequency its
  length implies, so the network tunes itself. Late trains drag behind the beat and
  go out of tune on a continuous curve; cancelled trains leave only a click.
  Inspired by Joshua Wolk's <a href="https://www.trainjazz.com">Train Jazz</a>.</p>
  <h3>Credits</h3>
  <p>Built by Sofia Vallejo Budziszewski as part of doctoral research at the
  <a href="https://iem.kug.ac.at">Institute for Electronic Music and Acoustics</a>,
  University of Music and Performing Arts Graz, Austria.</p>`;
