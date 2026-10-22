const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

// Список городов
const CITIES = [
  { name: 'Москвы',       nextCase: 'Владимира',     lat: 55.7558, lon: 37.6173 },
  { name: 'Владимира',    nextCase: 'Казани',        lat: 56.1290, lon: 40.4070 },
  { name: 'Казани',       nextCase: 'Екатеринбурга', lat: 55.7963, lon: 49.1088 },
  { name: 'Екатеринбурга',nextCase: 'Тюмени',        lat: 56.8389, lon: 60.6057 },
  { name: 'Тюмени',       nextCase: 'Омска',         lat: 57.1522, lon: 65.5272 },
  { name: 'Омска',        nextCase: 'Новосибирска',  lat: 54.9885, lon: 73.3242 },
  { name: 'Новосибирска', nextCase: 'Кемерово',      lat: 55.0084, lon: 82.9357 }, 
  { name: 'Кемерово',     nextCase: 'Красноярска',   lat: 55.3547, lon: 86.0873 },
  { name: 'Красноярска',  nextCase: 'Иркутска',      lat: 56.0153, lon: 92.8932 },
  { name: 'Иркутска',     nextCase: 'Улан-Удэ',      lat: 52.2870, lon: 104.3050 }, 
  { name: 'Улан-Удэ',     nextCase: 'Читы',          lat: 51.8335, lon: 107.5841 },
  { name: 'Читы',         nextCase: 'Благовещенска', lat: 52.0340, lon: 113.4994 },
  { name: 'Благовещенска',nextCase: 'Хабаровска',    lat: 50.2907, lon: 127.5272 },
  { name: 'Хабаровска',   nextCase: 'Владивостока',  lat: 48.4827, lon: 135.0838 },
  { name: 'Владивостока', nextCase: 'ФИНИШ',         lat: 43.1155, lon: 131.8855 }
];

// Дорожные расстояния между городами
const ROAD_DISTANCES = [185, 400, 380, 320, 550, 650, 260, 410, 1060, 460, 670, 980, 580, 760];

// ЖЕСТКАЯ ПРИВЯЗКА: 
// Сейчас они выехали из Красноярска (индекс 8), едут в Иркутск (индекс 9).
// До Иркутска осталось ~250 км. 
// Скрипт будет вычитать пройденный путь из 250 км, пока они не доедут.
let START_DIST = 250; 
let anchorLat = null;
let anchorLon = null;

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
    
    // Фиксируем первую точку, чтобы отсчитывать от неё пройденный путь
    if (anchorLat === null || anchorLon === null) {
      anchorLat = lat;
      anchorLon = lon;
    }

    // Считаем, сколько километров они проехали с момента первого запроса
    const deltaKm = haversine(anchorLat, anchorLon, lat, lon) / 1000;
    
    // Вычитаем из 250 км
    let distToIrkutsk = START_DIST - deltaKm;
    if (distToIrkutsk < 0) distToIrkutsk = 0;

    let message = "";

    // Если до Иркутска осталось больше 0 км, мы всё ещё едем к нему
    if (distToIrkutsk > 0) {
      const display = distToIrkutsk < 10 ? distToIrkutsk.toFixed(1) : Math.round(distToIrkutsk);
      message = `Мы выехали с Красноярска, до Иркутска осталось ${display} км`;
    } else {
      // Если доехали (дистанция стала 0), включаем следующий этап (Иркутск -> Улан-Удэ)
      message = `Мы выехали с Иркутска, до Улан-Удэ осталось 460 км`;
    }

    res.end(message);
    
  } catch (e) {
    res.end('Не удалось определить местоположение (ошибка GPS)');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
