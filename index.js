const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';
const POLL_INTERVAL_MS = 5 * 1000;   // сервер опрашивает rtirl каждые 5 сек
const CLIENT_REFRESH_MS = 3 * 1000;  // клиент перезапрашивает текст каждые 3 сек

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

const state = {
  lat: null,
  lon: null,
  updatedAt: null,
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
          reject(new Error('parse error: ' + e.message));
        }
      });
    }).on('error', reject);
  });
}

async function pollOnce() {
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
}

async function pollLoop() {
  await pollOnce();
  setTimeout(pollLoop, POLL_INTERVAL_MS);
}

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

// HTML-страница, которая сама тянет /text каждые 3 сек
function renderHtml() {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Маршрут</title>
<style>
  body { margin:0; background:transparent; font-family: Arial, sans-serif; }
  #msg { font-size: 32px; color: #fff; text-shadow: 0 0 4px #000; padding: 8px; }
</style>
</head>
<body>
<div id="msg">Загрузка...</div>
<script>
  const el = document.getElementById('msg');
  async function refresh() {
    try {
      const r = await fetch('/text?t=' + Date.now(), { cache: 'no-store' });
      el.textContent = await r.text();
    } catch (e) {
      el.textContent = 'Ошибка соединения';
    }
  }
  refresh();
  setInterval(refresh, ${CLIENT_REFRESH_MS});
</script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Отладка
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

  // Только текст — клиент дёргает это каждые 3 сек
  if (url.pathname === '/text') {
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(buildMessage());
    return;
  }

  // Принудительное обновление из rtirl
  if (url.pathname === '/refresh') {
    await pollOnce();
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0'
    });
    res.end(buildMessage());
    return;
  }

  // Главная — HTML с автообновлением
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  res.end(renderHtml());
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
  pollLoop();
});
