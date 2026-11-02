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

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
const distKm = (a,b,c,d) => haversine(a,b,c,d)/1000;

function fetchLocation() {
  return new Promise((resolve, reject) => {
    const url = `https://rtirl.com/api/pull?key=${encodeURIComponent(PULL_KEY)}&t=${Date.now()}&r=${Math.random()}`;
    https.get(url, { headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (!j || !j.location) return reject(new Error('no location'));
          resolve({ lat: j.location.latitude, lon: j.location.longitude });
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
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
  return `Мы находимся (выехали) с ${A.name}, до ${B.name} осталось ${disp} км`;
}

// Экспорт для Nightbot Custom API (Vercel / Netlify / любой serverless)
module.exports = async (req, res) => {
  try {
    const { lat, lon } = await fetchLocation();
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(buildMessage(lat, lon));
  } catch (e) {
    res.status(200).send('Не удалось определить местоположение (ошибка GPS)');
  }
};
