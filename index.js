const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

// Стартовые значения, которые мы привязываем к текущей точке
const START_DIST_IRK = 609;
const START_DIST_VLAD = 4480;

// Переменные для запоминания точки калибровки
let anchorLat = null;
let anchorLon = null;
let currentDistIrk = START_DIST_IRK;
let currentDistVlad = START_DIST_VLAD;

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
            lon: json.location.longitude,
            speedMs: typeof json.speed === 'number' ? json.speed : 0 
          });
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function formatTime(hours) {
  if (!isFinite(hours) || hours <= 0) return "в пути";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m} мин.`;
  return `${h} ч. ${m} мин.`;
}

const server = http.createServer(async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  
  try {
    const { lat, lon, speedMs } = await fetchLocation();
    const speedKmh = speedMs * 3.6;
    const calcSpeed = speedKmh > 5 ? speedKmh : 60; // Если стоят, берем 60 км/ч

    // Если это первый запрос (сервер только что проснулся или запустился)
    if (anchorLat === null || anchorLon === null) {
      anchorLat = lat;
      anchorLon = lon;
      // Принудительно ставим значения, которые ты просил
      currentDistIrk = START_DIST_IRK;
      currentDistVlad = START_DIST_VLAD;
    } else {
      // Считаем, на сколько километров сдвинулись блогеры
      const deltaKm = haversine(anchorLat, anchorLon, lat, lon) / 1000;
      
      // Если сдвинулись вперед (но не больше 50 км за раз, защита от глюков GPS)
      if (deltaKm > 0.01 && deltaKm < 50) {
        // Так как они едут в сторону Иркутска и Владивостока, вычитаем пройденное
        currentDistIrk -= deltaKm;
        currentDistVlad -= deltaKm;
        
        // Обновляем точку отсчета для следующего шага
        anchorLat = lat;
        anchorLon = lon;
      }
    }

    // Защита от ухода в минус
    if (currentDistIrk < 0) currentDistIrk = 0;
    if (currentDistVlad < 0) currentDistVlad = 0;

    const timeToNextHours = currentDistIrk / calcSpeed;
    const timeString = formatTime(timeToNextHours);

    const displayNext = currentDistIrk < 10 ? currentDistIrk.toFixed(1) : Math.round(currentDistIrk);
    const displayVlad = Math.round(currentDistVlad);
    
    res.end(`До Иркутска: ${displayNext} км (в пути ~${timeString}) | До Владивостока: ${displayVlad} км`);
    
  } catch (e) {
    res.end('Не удалось определить местоположение (ошибка GPS)');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
