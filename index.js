const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

// Города с правильным склонением
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

// Реальные дорожные расстояния
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
    
    let bestSegmentIdx = 10; // По умолчанию Улан-Удэ -> Чита
    let bestFraction = 0;

    // ЖЕСТКАЯ ОТСЕЧКА ПО ДОЛГОТЕ (чтобы не перескочить на Благовещенск раньше времени)
    if (lon < 112.0) {
      // Мы точно находимся в зоне между Улан-Удэ и Читой (или раньше).
      // Проверяем только отрезки до Читы.
      let minScore = Infinity;
      for (let i = 0; i <= 10; i++) { // отрезки от 0 до 10 (включительно)
        const a = CITIES[i];
        const b = CITIES[i + 1];
        
        const distToA = haversine(lat, lon, a.lat, a.lon) / 1000;
        const distToB = haversine(lat, lon, b.lat, b.lon) / 1000;
        const segLen = haversine(a.lat, a.lon, b.lat, b.lon) / 1000;
        
        // Оценка того, насколько мы близки к этому отрезку
        const score = (distToA + distToB) - segLen;
        
        if (score < minScore) {
          minScore = score;
          bestSegmentIdx = i;
          const denom = distToA + distToB;
          bestFraction = denom > 0 ? distToA / denom : 0;
        }
      }
    } else {
      // Мы проехали Читу, теперь ищем по всей карте (включая Благовещенск и Хабаровск)
      let minScore = Infinity;
      for (let i = 0; i < CITIES.length - 1; i++) {
        const a = CITIES[i];
        const b = CITIES[i + 1];
        
        const distToA = haversine(lat, lon, a.lat, a.lon) / 1000;
        const distToB = haversine(lat, lon, b.lat, b.lon) / 1000;
        const segLen = haversine(a.lat, a.lon, b.lat, b.lon) / 1000;
        
        const score = (distToA + distToB) - segLen;
        
        if (score < minScore) {
          minScore = score;
          bestSegmentIdx = i;
          const denom = distToA + distToB;
          bestFraction = denom > 0 ? distToA / denom : 0;
        }
      }
    }

    // Ограничиваем индекс, чтобы не вылететь за пределы массива
    if (bestSegmentIdx >= CITIES.length - 1) bestSegmentIdx = CITIES.length - 2;
    if (bestSegmentIdx < 0) bestSegmentIdx = 0;

    const lastCity = CITIES[bestSegmentIdx];
    const nextCity = CITIES[bestSegmentIdx + 1];
    const roadTotal = ROAD_DISTANCES[bestSegmentIdx];

    // Считаем оставшееся расстояние по дороге
    let distToNext = roadTotal * (1 - bestFraction);
    if (distToNext < 0) distToNext = 0;

    const displayDist = distToNext < 10 ? distToNext.toFixed(1) : Math.round(distToNext);

    // Вывод с большой буквы "Мы"
    res.end(`Мы находимся (выехали) с ${lastCity.name}, до ${nextCity.nextName} осталось ${displayDist} км`);
    
  } catch (e) {
    res.end('Не удалось определить местоположение (ошибка GPS)');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
