const http = require('http');
const https = require('https');

// Пул-ключ RealtimeIRL
const PULL_KEY = 'cjughse8qx7qm872';

// Список городов маршрута
const CITIES = [
  { name: 'Москва',       lat: 55.7558, lon: 37.6173 },
  { name: 'Владимир',     lat: 56.1290, lon: 40.4070 },
  { name: 'Казань',       lat: 55.7963, lon: 49.1088 },
  { name: 'Екатеринбург', lat: 56.8389, lon: 60.6057 },
  { name: 'Тюмень',       lat: 57.1522, lon: 65.5272 },
  { name: 'Омск',         lat: 54.9885, lon: 73.3242 },
  { name: 'Новосибирск',  lat: 55.0084, lon: 82.9357 },
  { name: 'Кемерово',     lat: 55.3547, lon: 86.0873 },
  { name: 'Красноярск',   lat: 56.0153, lon: 92.8932 },
  { name: 'Иркутск',      lat: 52.2870, lon: 104.3050 },
  { name: 'Улан-Удэ',     lat: 51.8335, lon: 107.5841 },
  { name: 'Чита',         lat: 52.0340, lon: 113.4994 },
  { name: 'Благовещенск', lat: 50.2907, lon: 127.5272 },
  { name: 'Хабаровск',    lat: 48.4827, lon: 135.0838 },
  { name: 'Владивосток',  lat: 43.1155, lon: 131.8855 }
];

// Расстояния по дорогам между соседними городами (в км)
const ROAD_TO_NEXT = [185, 400, 380, 320, 550, 650, 260, 410, 1060, 460, 670, 980, 580, 760, 0];

// Функция для расчета расстояния по прямой (формула гаверсинуса)
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Функция вычисления следующего города и расстояния до него
function getNextCityInfo(lat, lon) {
  const n = CITIES.length;
  let bestSegIdx = 0;
  let bestFraction = 0;
  let bestScore = Infinity;

  // Ищем отрезок между городами, на котором сейчас находимся
  for (let i = 0; i < n - 1; i++) {
    const a = CITIES[i], b = CITIES[i + 1];
    const distToA = haversine(lat, lon, a.lat, a.lon);
    const distToB = haversine(lat, lon, b.lat, b.lon);
    const segLen  = haversine(a.lat, a.lon, b.lat, b.lon);
    
    // Чем ближе сумма расстояний к длине отрезка, тем точнее мы на нем
    const score = (distToA + distToB) - segLen;

    if (score < bestScore) {
      bestScore = score;
      bestSegIdx = i;
      const denom = distToA + distToB;
      bestFraction = denom > 0 ? distToA / denom : 0;
    }
  }

  // Определяем, прошли ли мы уже город (начало отрезка)
  const distToA = haversine(lat, lon, CITIES[bestSegIdx].lat, CITIES[bestSegIdx].lon);
  let passedIdx = (distToA < 20000 || bestFraction > 0.25) ? bestSegIdx : bestSegIdx - 1;

  const nextIdx = Math.min(n - 1, passedIdx + 1);
  const nextCity = CITIES[nextIdx];

  // Считаем оставшееся расстояние по дорогам
  const roadTotal = ROAD_TO_NEXT[passedIdx] || 0;
  const straightTotal = haversine(CITIES[passedIdx].lat, CITIES[passedIdx].lon,
                                   nextCity.lat, nextCity.lon);
  const straightDone = haversine(CITIES[passedIdx].lat, CITIES[passedIdx].lon, lat, lon);
  
  let fraction = straightTotal > 0 ? straightDone / straightTotal : 0;
  fraction = Math.max(0, Math.min(1, fraction));
  const distKm = roadTotal * (1 - fraction);

  return { nextCity: nextCity.name, distKm };
}

// Функция запроса координат из RealtimeIRL
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

// Создаем HTTP-сервер, который будет отдавать текст для Nightbot
const server = http.createServer(async (req, res) => {
  try {
    const { lat, lon } = await fetchLocation();
    const { nextCity, distKm } = getNextCityInfo(lat, lon);
    
    // Округляем: если меньше 10 км, оставляем один знак после запятой
    const display = distKm < 10 ? distKm.toFixed(1) : Math.round(distKm);
    
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`До ${nextCity} осталось ${display} км`);
  } catch (e) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Не удалось определить местоположение');
  }
});

// Render автоматически передает порт через переменную окружения PORT
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
