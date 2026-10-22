const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

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

const ROAD_TO_NEXT = [185, 400, 380, 320, 550, 650, 260, 410, 1060, 460, 670, 980, 580, 760, 0];

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getNextCityInfo(lat, lon) {
  const n = CITIES.length;
  
  // 1. Ищем ближайший город к текущей точке
  let nearestIdx = 0;
  let minDist = Infinity;

  for (let i = 0; i < n; i++) {
    const d = haversine(lat, lon, CITIES[i].lat, CITIES[i].lon);
    if (d < minDist) {
      minDist = d;
      nearestIdx = i;
    }
  }

  // 2. Определяем индекс города, от которого считаем
  // Если мы ближе 35 км к городу, значит мы в нём (или на подъезде). 
  // Берем этот город как отправную точку для поиска следующего.
  let fromIdx = nearestIdx;
  
  // Если мы стоим в самом городе (меньше 35 км), то следующий — это +1
  // Если мы уже далеко от него (в пути), то ближайший город — это следующий.
  if (minDist > 35000) {
     fromIdx = Math.max(0, nearestIdx - 1); 
  }

  const nextIdx = Math.min(n - 1, fromIdx + 1);
  const nextCity = CITIES[nextIdx];

  // 3. Считаем километры по дороге
  const roadTotal = ROAD_TO_NEXT[fromIdx] || 0;
  const straightTotal = haversine(CITIES[fromIdx].lat, CITIES[fromIdx].lon, nextCity.lat, nextCity.lon);
  const straightDone = haversine(CITIES[fromIdx].lat, CITIES[fromIdx].lon, lat, lon);
  
  let fraction = straightTotal > 0 ? straightDone / straightTotal : 0;
  fraction = Math.max(0, Math.min(1, fraction));
  const distKm = roadTotal * (1 - fraction);

  return { nextCity: nextCity.name, distKm };
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
          
          // Проверяем, насколько свежие данные (опционально)
          const ts = json.updatedAt || Date.now();
          const ageMins = Math.round((Date.now() - ts) / 60000);
          
          resolve({ lat: json.location.latitude, lon: json.location.longitude, ageMins });
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  
  try {
    const { lat, lon, ageMins } = await fetchLocation();
    const { nextCity, distKm } = getNextCityInfo(lat, lon);
    
    const display = distKm < 10 ? distKm.toFixed(1) : Math.round(distKm);
    
    // Выводим город и расстояние. 
    // Если данные старые, можно добавить приписку (но для Nightbot лучше просто текст)
    let text = `До ${nextCity} осталось ${display} км`;
    if (ageMins > 5) text += ` (GPS обновлен ${ageMins} мин. назад)`;
    
    res.end(text);
  } catch (e) {
    res.end('Не удалось определить местоположение (ошибка GPS)');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
