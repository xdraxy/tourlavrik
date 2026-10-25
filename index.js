const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

// Список городов с координатами и правильными падежами
const CITIES = [
  { name: 'Москвы',        nextName: 'Владимира',     lat: 55.7558, lon: 37.6173, road: 185 },
  { name: 'Владимира',     nextName: 'Казани',        lat: 56.1290, lon: 40.4070, road: 400 },
  { name: 'Казани',        nextName: 'Екатеринбурга', lat: 55.7963, lon: 49.1088, road: 380 },
  { name: 'Екатеринбурга', nextName: 'Тюмени',        lat: 56.8389, lon: 60.6057, road: 320 },
  { name: 'Тюмени',        nextName: 'Омска',         lat: 57.1522, lon: 65.5272, road: 550 },
  { name: 'Омска',         nextName: 'Новосибирска',  lat: 54.9885, lon: 73.3242, road: 650 },
  { name: 'Новосибирска',  nextName: 'Кемерово',      lat: 55.0084, lon: 82.9357, road: 260 }, 
  { name: 'Кемерово',      nextName: 'Красноярска',   lat: 55.3547, lon: 86.0873, road: 410 },
  { name: 'Красноярска',   nextName: 'Иркутска',      lat: 56.0153, lon: 92.8932, road: 1060 },
  { name: 'Иркутска',      nextName: 'Улан-Удэ',      lat: 52.2870, lon: 104.3050, road: 460 }, 
  { name: 'Улан-Удэ',      nextName: 'Читы',          lat: 51.8335, lon: 107.5841, road: 670 },
  { name: 'Читы',          nextName: 'Благовещенска', lat: 52.0340, lon: 113.4994, road: 1150 }, // Твои данные: ~1100-1200
  { name: 'Благовещенска', nextName: 'Хабаровска',    lat: 50.2907, lon: 127.5272, road: 720 },  // Твои данные: ~700-750
  { name: 'Хабаровска',    nextName: 'Владивостока',  lat: 48.4827, lon: 135.0838, road: 770 },  // Твои данные: ~750-800
  { name: 'Владивостока',  nextName: 'ФИНИШ',         lat: 43.1155, lon: 131.8855, road: 0 }
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
    
    // 1. Находим текущий этап (между какими городами мы находимся)
    // Идем строго по порядку. Если мы проехали город (расстояние до него по прямой < 50 км), 
    // переключаемся на следующий этап.
    
    let currentStage = 0; // Начинаем с Москва -> Владимир
    
    for (let i = 0; i < CITIES.length - 1; i++) {
      // Считаем расстояние по прямой от текущей точки до СЛЕДУЮЩЕГО города этапа
      const distToNextCity = haversine(lat, lon, CITIES[i + 1].lat, CITIES[i + 1].lon) / 1000;
      
      // Если до следующего города больше 50 км, значит мы еще едем к нему (или находимся в предыдущем)
      // Это значит, что текущий этап - правильный.
      if (distToNextCity > 50) {
        currentStage = i;
        break;
      }
      
      // Если до следующего города меньше 50 км, значит мы его достигли. 
      // Цикл продолжается, и currentStage сдвигается дальше.
      currentStage = i + 1;
    }

    // Защита от выхода за пределы
    if (currentStage >= CITIES.length - 1) currentStage = CITIES.length - 2;

    const lastCity = CITIES[currentStage];
    const nextCity = CITIES[currentStage + 1];
    const totalRoadKm = lastCity.road;

    // 2. Считаем, сколько мы проехали от предыдущего города до текущей точки
    // Для этого берем расстояние по прямой от прошлого города до текущей точки
    const straightFromLast = haversine(lat, lon, lastCity.lat, lastCity.lon) / 1000;
    const straightTotal = haversine(lastCity.lat, lastCity.lon, nextCity.lat, nextCity.lon) / 1000;
    
    // Вычисляем коэффициент (сколько прямых километров в одном дорожном)
    const factor = straightTotal > 0 ? (totalRoadKm / straightTotal) : 1;
    
    // Переводим пройденное прямое расстояние в дорожное и вычитаем из общего
    let distToNext = totalRoadKm - (straightFromLast * factor);
    
    // Защита: не может быть меньше 0 и не может быть больше общего
    if (distToNext < 0) distToNext = 0;
    if (distToNext > totalRoadKm) distToNext = totalRoadKm;

    const displayDist = distToNext < 10 ? distToNext.toFixed(1) : Math.round(distToNext);

    // 3. Выводим результат
    res.end(`Мы находимся (выехали) с ${lastCity.name}, до ${nextCity.nextName} осталось ${displayDist} км`);
    
  } catch (e) {
    res.end('Не удалось определить местоположение (ошибка GPS)');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
