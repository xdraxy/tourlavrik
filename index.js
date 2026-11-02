const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

// Координаты городов
const CITIES = {
  IRKUTSK:   { lat: 52.2870, lon: 104.3050, name: 'Иркутска', nextName: 'Улан-Удэ' },
  ULAN_UDE:  { lat: 51.8335, lon: 107.5841, name: 'Улан-Удэ', nextName: 'Читы' },
  CHITA:     { lat: 52.0340, lon: 113.4994, name: 'Читы', nextName: 'Благовещенска' },
  BLAG:      { lat: 50.2907, lon: 127.5272, name: 'Благовещенска', nextName: 'Хабаровска' },
  KHAB:      { lat: 48.4827, lon: 135.0838, name: 'Хабаровска', nextName: 'Владивостока' },
  VLAD:      { lat: 43.1155, lon: 131.8855, name: 'Владивостока', nextName: 'ФИНИШ' }
};

// Участки маршрута: от города A до города B и расстояние по трассе
const LEGS = [
  { from: 'IRKUTSK',  to: 'ULAN_UDE', km: 460  },
  { from: 'ULAN_UDE', to: 'CHITA',    km: 670  },
  { from: 'CHITA',    to: 'BLAG',     km: 860  }, // было 1150 — уменьшено до реальных ~860
  { from: 'BLAG',     to: 'KHAB',     km: 720  },
  { from: 'KHAB',     to: 'VLAD',     km: 770  }
];

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
    const url = `https://rtirl.com/api/pull?key=${encodeURIComponent(PULL_KEY)}&t=${Date.now()}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json || !json.location) return reject(new Error('no location'));
          resolve({ lat: json.location.latitude, lon: json.location.longitude });
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });

  try {
    const { lat, lon } = await fetchLocation();

    // Определяем, на каком участке маршрута мы находимся
    let bestLeg = null;
    let bestScore = Infinity;
    let bestFraction = 0;

    for (const leg of LEGS) {
      const A = CITIES[leg.from];
      const B = CITIES[leg.to];

      const dAP = distKm(lat, lon, A.lat, A.lon); // до начала участка
      const dBP = distKm(lat, lon, B.lat, B.lon); // до конца участка
      const dAB = distKm(A.lat, A.lon, B.lat, B.lon); // длина участка по прямой

      // Пройденная доля участка (0 — в начале, 1 — в конце)
      let fraction = (dAP + dBP - dAB) > 0
        ? (dAP + dBP - dAB) / (2 * dAB)
        : 0;
      fraction = Math.max(0, Math.min(1, fraction));

      // "Штраф" за нахождение вне участка
      const score = dAP + dBP - dAB;

      if (score < bestScore) {
        bestScore = score;
        bestLeg = leg;
        bestFraction = fraction;
      }
    }

    const A = CITIES[bestLeg.from];
    const B = CITIES[bestLeg.to];

    // Оставшееся расстояние по трассе до конца участка
    let remaining = bestLeg.km * (1 - bestFraction);
    if (remaining < 0) remaining = 0;
    if (remaining > bestLeg.km) remaining = bestLeg.km;

    const display = remaining < 10 ? remaining.toFixed(1) : Math.round(remaining);
    const message = `Мы находимся (выехали) с ${A.name}, до ${B.name} осталось ${display} км`;

    res.end(message);

  } catch (e) {
    res.end('Не удалось определить местоположение (ошибка GPS)');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
