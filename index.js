const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

// Список городов с координатами и правильными падежами
// lastCase - "выехали с (чего?)" (Родительный падеж)
// nextCase - "доехать до (чего?)" (Родительный падеж)
const CITIES = [
  { name: 'Москвы',       nextCase: 'Владимира',     lat: 55.7558, lon: 37.6173 },
  { name: 'Владимира',    nextCase: 'Казани',        lat: 56.1290, lon: 40.4070 },
  { name: 'Казани',       nextCase: 'Екатеринбурга', lat: 55.7963, lon: 49.1088 },
  { name: 'Екатеринбурга',nextCase: 'Тюмени',        lat: 56.8389, lon: 60.6057 },
  { name: 'Тюмени',       nextCase: 'Омска',         lat: 57.1522, lon: 65.5272 },
  { name: 'Омска',        nextCase: 'Новосибирска',  lat: 54.9885, lon: 73.3242 },
  { name: 'Новосибирска', nextCase: 'Кемерово',      lat: 55.0084, lon: 82.9357 }, // Кемерово не склоняется
  { name: 'Кемерово',     nextCase: 'Красноярска',   lat: 55.3547, lon: 86.0873 },
  { name: 'Красноярска',  nextCase: 'Иркутска',      lat: 56.0153, lon: 92.8932 },
  { name: 'Иркутска',     nextCase: 'Улан-Удэ',      lat: 52.2870, lon: 104.3050 }, // Улан-Удэ не склоняется
  { name: 'Улан-Удэ',     nextCase: 'Читы',          lat: 51.8335, lon: 107.5841 },
  { name: 'Читы',         nextCase: 'Благовещенска', lat: 52.0340, lon: 113.4994 },
  { name: 'Благовещенска',nextCase: 'Хабаровска',    lat: 50.2907, lon: 127.5272 },
  { name: 'Хабаровска',   nextCase: 'Владивостока',  lat: 48.4827, lon: 135.0838 },
  { name: 'Владивостока', nextCase: 'ФИНИШ',         lat: 43.1155, lon: 131.8855 }
];

// Расстояния по дороге между соседними городами (в км)
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
          resolve({ 
            lat: json.location.latitude, 
            lon: json.location.longitude 
          });
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

    // 1. Находим ближайший город к текущей точке
    for (let i = 0; i < CITIES.length; i++) {
      const d = haversine(lat, lon, CITIES[i].lat, CITIES[i].lon) / 1000;
      if (d < minDistance) {
        minDistance = d;
        currentCityIdx = i;
      }
    }

    // 2. Определяем, отъехали ли мы от этого города на 100+ км
    let passedIdx = currentCityIdx;
    
    if (minDistance > 100) {
      // Если мы находимся дальше 100 км от ближайшего города, 
      // значит, мы точно выехали из предыдущего. 
      // Чтобы понять, куда мы едем, смотрим на следующий город.
      if (currentCityIdx < CITIES.length - 1) {
        passedIdx = currentCityIdx;
      }
    } else {
      // Если мы в пределах 100 км от текущего города, 
      // значит, мы из него выехали (или все еще в нем), и едем в следующий.
      passedIdx = currentCityIdx;
    }

    // Защита от выхода за границы массива
    if (passedIdx >= CITIES.length - 1) passedIdx = CITIES.length - 2;
    if (passedIdx < 0) passedIdx = 0;

    const lastCity = CITIES[passedIdx];
    const nextCity = CITIES[passedIdx + 1];
    
    // 3. Считаем расстояние по дороге до следующего города
    const roadTotal = ROAD_DISTANCES[passedIdx];
    const straightTotal = haversine(lastCity.lat, lastCity.lon, nextCity.lat, nextCity.lon);
    const straightDone = haversine(lastCity.lat, lastCity.lon, lat, lon);
    
    let fraction = straightTotal > 0 ? straightDone / straightTotal : 0;
    fraction = Math.max(0, Math.min(1, fraction));
    
    let distToNext = roadTotal * (1 - fraction);
    if (distToNext < 0) distToNext = 0;

    const displayDist = distToNext < 10 ? distToNext.toFixed(1) : Math.round(distToNext);

    // 4. Формируем сообщение
    // Если мы уже приехали в следующий город (расстояние меньше 20 км), 
    // то "выехали с" будет уже этот следующий город, и цель сдвинется.
    if (displayDist < 20 && passedIdx < CITIES.length - 2) {
       const newLast = CITIES[passedIdx + 1];
       const newNext = CITIES[passedIdx + 2];
       // Расстояние до нового следующего города
       const newRoadTotal = ROAD_DISTANCES[passedIdx + 1];
       // (тут можно оставить простой вывод, так как они только что приехали)
       res.end(`Мы выехали с ${newLast.name}, до ${newNext.nextCase} осталось ${newRoadTotal} км`);
       return;
    }

    res.end(`Мы выехали с ${lastCity.name}, до ${nextCity.nextCase} осталось ${displayDist} км`);
    
  } catch (e) {
    res.end('Не удалось определить местоположение (ошибка GPS)');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
