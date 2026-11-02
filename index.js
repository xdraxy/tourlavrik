const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

const CITIES = {
  IRKUTSK:  { lat: 52.2870, lon: 104.3050, name: 'Иркутска' },
  ULAN_UDE: { lat: 51.8335, lon: 107.5841, name: 'Улан-Удэ' },
  CHITA:    { lat: 52.0340, lon: 113.4994, name: 'Читы' },
  BLAG:     { lat: 50.2907, lon: 127.5272, name: 'Благовещенска' },
  KHAB:     { lat: 48.4827, lon: 135.0838, name: 'Хабаровска' },
  VLAD:     { lat: 43.1155, lon: 131.8855, name: 'Владивостока' }
};

const LEGS = [
  { from: 'IRKUTSK',  to: 'ULAN_UDE', km: 460  },
  { from: 'ULAN_UDE', to: 'CHITA',    km: 670  },
  { from: 'CHITA',    to: 'BLAG',     km: 860  },
  { from: 'BLAG',     to: 'KHAB',     km: 720  },
  { from: 'KHAB',     to: 'VLAD',     km: 770  }
];

const state = { lat: null, lon: null, updatedAt: 0, lastError: null, lastRaw: null };

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
const distKm = (a,b,c,d) => haversine(a,b,c,d)/1000;

// Всегда заново тянем rtirl, никогда не берём из кэша
function fetchLocation() {
  return new Promise((resolve, reject) => {
    const url = `https://rtirl.com/api/pull?key=${encodeURIComponent(PULL_KEY)}&t=${Date.now()}&r=${Math.random()}`;
    const req = https.get(url, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'User-Agent': 'Mozilla/5.0 (RouteTracker)'
      },
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        state.lastRaw = data;
        try {
          const j = JSON.parse(data);
          if (!j || !j.location || j.location.latitude == null || j.location.longitude == null) {
            return reject(new Error('no location in response'));
          }
          state.lat = j.location.latitude;
          state.lon = j.location.longitude;
          state.updatedAt = Date.now();
          state.lastError = null;
          resolve({ lat: state.lat, lon: state.lon });
        } catch (e) {
          state.lastError = 'parse: ' + e.message;
          reject(e);
        }
      });
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => { state.lastError = e.message; reject(e); });
  });
}

function buildMessage(lat, lon) {
  let bestLeg = null, bestScore = Infinity, bestFraction = 0;
  for (const leg of LEGS) {
    const A = CITIES[leg.from], B = CITIES[leg.to];
    const dAP = distKm(lat, lon, A.lat, A.lon);
    const dBP = distKm(lat, lon, B.lat, B.lon);
    const dAB = distKm(A.lat, A.lon, B.lat, B.lon);
    let fraction = (dAP + dBP - dAB) > 0 ? (dAP + dBP - dAB) / (2 * dAB) : 0;
    fraction = Math.max(0, Math.min(1, fraction));
    const score = dAP + dBP - dAB;
    if (score < bestScore) { bestScore = score; bestLeg = leg; bestFraction = fraction; }
  }
  const A = CITIES[bestLeg.from], B = CITIES[bestLeg.to];
  let rem = bestLeg.km * (1 - bestFraction);
  rem = Math.max(0, Math.min(bestLeg.km, rem));
  const disp = rem < 10 ? rem.toFixed(1) : Math.round(rem);
  return `Из ${A.name} до ${B.name}: ${disp} км`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/debug') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      lat: state.lat, lon: state.lon,
      updatedAt: state.updatedAt ? new Date(state.updatedAt).toISOString() : null,
      ageSeconds: state.updatedAt ? Math.round((Date.now() - state.updatedAt)/1000) : null,
      lastError: state.lastError,
      lastRaw: state.lastRaw,
      message: state.lat != null ? buildMessage(state.lat, state.lon) : null
    }, null, 2));
    return;
  }

  // Главное: при КАЖДОМ запросе синхронно тянем rtirl и считаем свежее значение
  try {
    const { lat, lon } = await fetchLocation();
    const text = buildMessage(lat, lon);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(text);
  } catch (e) {
    // Если rtirl не ответил — отдаём последнее известное, чтобы Nightbot не падал
    if (state.lat != null) {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end(buildMessage(state.lat, state.lon));
    } else {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      });
      res.end('GPS error');
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Listening on ' + PORT));
