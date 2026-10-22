const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

// Те же данные, что в виджете
const CITIES = [
  { name: 'Москва',       lat: 55.7558, lon: 37.6173, roadToNext: 185  },
  { name: 'Владимир',     lat: 56.1290, lon: 40.4070, roadToNext: 400  },
  { name: 'Казань',       lat: 55.7963, lon: 49.1088, roadToNext: 380  },
  { name: 'Екатеринбург', lat: 56.8389, lon: 60.6057, roadToNext: 320  },
  { name: 'Тюмень',       lat: 57.1522, lon: 65.5272, roadToNext: 550  },
  { name: 'Омск',         lat: 54.9885, lon: 73.3242, roadToNext: 650  },
  { name: 'Новосибирск',  lat: 55.0084, lon: 82.9357, roadToNext: 260  },
  { name: 'Кемерово',     lat: 55.3547, lon: 86.0873, roadToNext: 410  },
  { name: 'Красноярск',   lat: 56.0153, lon: 92.8932, roadToNext: 1060 },
  { name: 'Иркутск',      lat: 52.2870, lon: 104.3050, roadToNext: 460  },
  { name: 'Улан-Удэ',     lat: 51.8335, lon: 107.5841, roadToNext: 670  },
  { name: 'Чита',         lat: 52.0340, lon: 113.4994, roadToNext: 980  },
  { name: 'Благовещенск', lat: 50.2907, lon: 127.5272, roadToNext: 580  },
  { name: 'Хабаровск',    lat: 48.4827, lon: 135.0838, roadToNext: 760  },
  { name: 'Владивосток',  lat: 43.1155, lon: 131.8855, roadToNext: 0    }
];

const TOTAL_ROUTE_KM = 9000;
const INITIAL_TRAVELED_KM = 4032;

// Haversine
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getStats(lat, lon) {
  const n = CITIES.length;
  
  // Ищем текущий отрезок
  let bestSegIdx = 0;
  let bestSegFraction = 0;
  let bestSegScore = Infinity;

  for (let i = 0; i < n - 1; i++) {
    const a = CITIES[i], b = CITIES[i + 1];
    const distToA = getDistance(lat, lon, a.lat, a.lon);
    const distToB = getDistance(lat, lon, b.lat, b.lon);
    const segLen  = getDistance(a.lat, a.lon, b.lat, b.lon);
    const score = (distToA + distToB) - segLen;

    if (score < bestSegScore) {
      bestSegScore = score;
      bestSegIdx = i;
      const denom = distToA + distToB;
      bestSegFraction = denom > 0 ? distToA / denom : 0;
    }
  }

  // Определяем пройденный город (как в виджете)
  const distToA = getDistance(lat, lon, CITIES[bestSegIdx].lat, CITIES[bestSegIdx].lon);
  const CITY_RADIUS_M = 20000;
  
  let passedIdx = -1;
  if (bestSegIdx >= 0 && bestSegIdx < n - 1) {
    const distToB = getDistance(lat, lon, CITIES[bestSegIdx + 1].lat, CITIES[bestSegIdx + 1].lon);
    if (distToA < CITY_RADIUS_M) {
      passedIdx = bestSegIdx;
    } else if (distToB < CITY_RADIUS_M) {
      passedIdx = bestSegIdx + 1;
    } else if (bestSegFraction > 0.25) {
      passedIdx = bestSegIdx;
    } else {
      passedIdx = bestSegIdx - 1;
    }
  } else {
    passedIdx = n - 2;
  }

  // Следующий город
  const nextIdx = Math.min(n - 1, passedIdx + 1);
  const nextCity = CITIES[nextIdx];

  // Расстояние до следующего города
  const fromIdx = Math.max(0, nextIdx - 1);
  const fromCity = CITIES[fromIdx];
  const toCity = CITIES[nextIdx];
  const roadTotal = fromCity.roadToNext || 0;
  const straightTotal = getDistance(fromCity.lat, fromCity.lon, toCity.lat, toCity.lon);
  const straightDone  = getDistance(fromCity.lat, fromCity.lon, lat, lon);
  
  let fraction = straightTotal > 0 ? straightDone / straightTotal : 0;
  fraction = Math.max(0, Math.min(1, fraction));
  const distToNext = roadTotal * (1 - fraction);

  // Общий пробег (грубо, по прямой от Москвы + стартовое значение)
  // В виджете это делается через дельты GPS. Здесь мы просто берем приблизительное значение.
  const straightFromMoscow = getDistance(CITIES[0].lat, CITIES[0].lon, lat, lon) / 1000;
  let traveledKm = straightFromMoscow;
  if (traveledKm < INITIAL_TRAVELED_KM) traveledKm = INITIAL_TRAVELED_KM;
  
  const remainingToVlad = Math.max(0, TOTAL_ROUTE_KM - traveledKm);

  return { nextCity: nextCity.name, distToNext, remainingToVlad };
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
    const stats = getStats(lat, lon);
    
    const displayNext = stats.distToNext < 10 ? stats.distToNext.toFixed(1) : Math.round(stats.distToNext);
    const displayVlad = Math.round(stats.remainingToVlad);
    
    res.end(`До ${stats.nextCity}: ${displayNext} км | До Владивостока: ${displayVlad} км`);
  } catch (e) {
    res.end('Не удалось определить местоположение (ошибка GPS)');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
