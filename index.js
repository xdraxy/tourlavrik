const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

// Города (в правильных падежах для вывода)
const CITIES = [
  { name: 'Москвы',       nextName: 'Владимира',     lat: 55.7558, lon: 37.6173 },
  { name: 'Владимира',    nextName: 'Казани',        lat: 56.1290, lon: 40.4070 },
  { name: 'Казани',       nextName: 'Екатеринбурга', lat: 55.7963, lon: 49.1088 },
  { name: 'Екатеринбурга',nextName: 'Тюмени',        lat: 56.8389, lon: 60.6057 },
  { name: 'Тюмени',       nextName: 'Омска',         lat: 57.1522, lon: 65.5272 },
  { name: 'Омска',        nextName: 'Новосибирска',  lat: 54.9885, lon: 73.3242 },
  { name: 'Новосибирска', nextName: 'Кемерово',      lat: 55.0084, lon: 82.9357 }, 
  { name: 'Кемерово',     nextName: 'Красноярска',   lat: 55.3547, lon: 86.0873 },
  { name: 'Красноярска',  nextName: 'Иркутска',      lat: 56.0153, lon: 92.8932 },
  { name: 'Иркутска',     nextName: 'Улан-Удэ',      lat: 52.2870, lon: 104.3050 }, 
  { name: 'Улан-Удэ',     nextName: 'Читы',          lat: 51.8335, lon: 107.5841 },
  { name: 'Читы',         nextName: 'Благовещенска', lat: 52.0340, lon: 113.4994 },
  { name: 'Благовещенска',nextName: 'Хабаровска',    lat: 50.2907, lon: 127.5272 },
  { name: 'Хабаровска',   nextName: 'Владивостока',  lat: 48.4827, lon: 135.0838 },
  { name: 'Владивостока', nextName: 'ФИНИШ',         lat: 43.1155, lon: 131.8855 }
];

// Реальные дорожные расстояния между городами (в км)
const ROAD_DISTANCES = [185, 400, 380, 320, 550, 650, 260, 410, 1060, 460, 670, 980, 580, 760];

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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
    
    let currentCityIdx = 0;
    let minDistance = Infinity;

    // 1. Ищем ближайший город
    for (let i = 0; i < CITIES.length; i++) {
      const d = haversine(lat, lon, CITIES[i].lat, CITIES[i].lon) / 1000;
      if (d < minDistance) {
        minDistance = d;
        currentCityIdx = i;
      }
    }

    // 2. Определяем, куда мы едем
    // Если мы в радиусе 100 км от города, считаем, что мы всё еще "в нём" (или только выехали).
    // Если мы дальше 100 км, значит мы уже на трассе.
    
    let fromIdx = currentCityIdx;
    
    if (minDistance > 100) {
      // Если мы на трассе, ближайший город - это цель, а выехали мы из предыдущего.
      fromIdx = Math.max(0, currentCityIdx - 1);
    }

    // Если мы находимся ровно в Улан-Удэ, minDistance будет меньше 100, 
    // значит fromIdx останется Улан-Удэ. И мы поедем в Читу.
    
    // Защита от выхода за пределы списка
    if (fromIdx >= CITIES.length - 1) fromIdx = CITIES.length - 2;
    
    const lastCity = CITIES[fromIdx];
    const nextCity = CITIES[fromIdx + 1];
    const roadTotal = ROAD_DISTANCES[fromIdx];

    // 3. Считаем пройденное расстояние от lastCity
    const straightTotal = haversine(lastCity.lat, lastCity.lon, nextCity.lat, nextCity.lon);
    const straightDone = haversine(lastCity.lat, lastCity.lon, lat, lon);
    
    let fraction = straightTotal > 0 ? straightDone / straightTotal : 0;
    fraction = Math.max(0, Math.min(1, fraction));
    
    let distToNext = roadTotal * (1 - fraction);
    if (distToNext < 0) distToNext = 0;

    const displayDist = distToNext < 10 ? distToNext.toFixed(1) : Math.round(distToNext);

    // 4. Формируем сообщение
    res.end(`Мы выехали с ${lastCity.name}, до ${nextCity.nextName} осталось ${displayDist} км`);
    
  } catch (e) {
    res.end('Не удалось определить местоположение (ошибка GPS)');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
