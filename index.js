const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';
const POLL_INTERVAL_MS = 10 * 1000; // опрашиваем rtirl каждые 10 секунд

// Координаты городов
const CITIES = {
  IRKUTSK:   { lat: 52.2870, lon: 104.3050, name: 'Иркутска', nextName: 'Улан-Удэ' },
  ULAN_UDE:  { lat: 51.8335, lon: 107.5841, name: 'Улан-Удэ', nextName: 'Читы' },
  CHITA:     { lat: 52.0340, lon: 113.4994, name: 'Читы', nextName: 'Благовещенска' },
  BLAG:      { lat: 50.2907, lon: 127.5272, name: 'Благовещенска', nextName: 'Хабаровска' },
  KHAB:      { lat: 48.4827, lon: 135.0838, name: 'Хабаровска', nextName: 'Владивостока' },
  VLAD:      { lat: 43.1155, lon: 131.8855, name: 'Владивостока', nextName: 'ФИНИШ' }
};

// Участки маршрута
const LEGS = [
  { from: 'IRKUTSK',  to: 'ULAN_UDE', km: 460  },
  { from: 'ULAN_UDE', to: 'CHITA',    km: 670  },
  { from: 'CHITA',    to: 'BLAG',     km: 860  },
  { from: 'BLAG',     to: 'KHAB',     km: 720  },
  { from: 'KHAB',     to: 'VLAD',     km: 770  }
];

// Последнее известное состояние
const state = {
  lat: null,
  lon: null,
  updatedAt: null,   // когда последний раз успешно обновились
  lastError: null,
  lastRawResponse: null
};

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function distKm(lat1, lon1, lat2, lon2) {
  return haversine(lat1, lon1, lat2, lon2) / 1000;
}

// Запрос к rtirl.com по pull key
function fetchLocation() {
  return new Promise((resolve, reject) => {
    const url = `https://rtirl.com/api/pull?key=${encodeURIComponent(PULL_KEY)}&t=${Date.now()}&r=${Math.random()}`;
    const opts = {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'User-Agent': 'Mozilla/5.0 (compatible; RouteTracker/1.0)'
      }
    };
    https.get(url, opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        state.lastRawResponse = data;
        try {
          const json = JSON.parse(data);
          if (!json || !json.location) return reject(new Error('no location in response'));
          resolve({ lat: json.location.latitude, lon: json.location.longitude });
        } catch (e) {
          reject(new Error('parse error: ' + e.message + ' | raw: ' + data.slice(0, 200)));
        }
      });
    }).on('error', reject);
  });
}

// Фоновый опрос
async function pollLoop() {
  try {
    const { lat, lon } = await fetchLocation();
    state.lat = lat;
    state.lon = lon;
    state.updatedAt = Date.now();
    state.lastError = null;
    console.log(`[poll ${new Date().toISOString()}] lat=${lat} lon=${lon}`);
  } catch (e) {
    state.lastError = e.message;
    console.error(`[poll ${new Date().toISOString()}] error: ${e.message}`);
  }
  setTimeout(pollLoop, POLL_INTERVAL_MS);
}

// Расчёт сообщения по текущему состоянию
function buildMessage() {
  if (state.lat == null || state.lon == null) {
    return 'Ожидание данных GPS...';
  }
  const lat = state.lat, lon = state.lon;

  let bestLeg = null;
  let bestScore = Infinity;
  let bestFraction = 0;

  for (const leg of LEGS) {
    const A = CITIES[leg.from];
    const B = CITIES[leg.to];

    const dAP = distKm(lat, lon, A.lat, A.lon);
    const dBP = distKm(lat, lon, B.lat, B.lon);
    const dAB = distKm(A.lat, A.lon, B.lat, B.lon);

    let fraction = (dAP + dBP - dAB) > 0
      ? (dAP + dBP - dAB) / (2 * dAB)
      : 0;
    fraction = Math.max(0, Math.min(1, fraction));

    const score = dAP + dBP - dAB;

    if (score < bestScore) {
      bestScore = score;
      bestLeg = leg;
      bestFraction = fraction;
    }
  }

  const A = CITIES[bestLeg.from];
  const B = CITIES[bestLeg.to];

  let remaining = bestLeg.km * (1 - bestFraction);
  if (remaining < 0) remaining = 0;
  if (remaining > bestLeg.km) remaining = bestLeg.km;

  const display = remaining < 10 ? remaining.toFixed(1) : Math.round(remaining);
  return `Мы находимся (выехали) с ${A.name}, до ${B.name} осталось ${display} км`;
}

const server = http.createServer(async (req, res) => {
  // Ручное обновление: /?refresh=1 — сразу дёргает rtirl и возвращает свежее
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/debug') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      lat: state.lat,
      lon: state.lon,
      updatedAt: state.updatedAt ? new Date(state.updatedAt).toISOString() : null,
      ageSeconds: state.updatedAt ? Math.round((Date.now() - state.updatedAt) / 1000) : null,
      lastError: state.lastError,
      lastRawResponse: state.lastRawResponse,
      message: buildMessage()
    }, null, 2));
    return;
  }

  if (url.searchParams.get('refresh') === '1') {
    try {
      const { lat, lon } = await fetchLocation();
      state.lat = lat;
      state.lon = lon;
      state.updatedAt = Date.now();
      state.lastError = null;
    } catch (e) {
      state.lastError = e.message;
    }
  }

  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.end(buildMessage());
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
  pollLoop(); // запускаем фоновый опрос rtirl.com
});
