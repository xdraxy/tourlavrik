const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

// Отправные значения расстояний
let currentDistToIrk = 880;
let currentDistToVlad = 4745; // Примерное расстояние до Владивостока от текущей точки

// Переменные для отслеживания координат
let lastLat = null;
let lastLon = null;

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

    if (lastLat === null || lastLon === null) {
      // Первый запрос: просто запоминаем координаты
      lastLat = lat;
      lastLon = lon;
    } else {
      // Считаем, на сколько км сдвинулись с прошлого запроса
      const deltaKm = haversine(lastLat, lastLon, lat, lon) / 1000;
      
      // Если сдвиг адекватный (не глюк GPS), вычитаем из текущего расстояния
      if (deltaKm < 50 && deltaKm > 0.01) {
        currentDistToIrk -= deltaKm;
        currentDistToVlad -= deltaKm;
        
        // Обновляем последнюю точку
        lastLat = lat;
        lastLon = lon;
      }
    }

    // Защита от отрицательных значений
    if (currentDistToIrk < 0) currentDistToIrk = 0;
    if (currentDistToVlad < 0) currentDistToVlad = 0;

    // Расчет времени до Иркутска
    const timeToNextHours = currentDistToIrk / calcSpeed;
    const timeString = formatTime(timeToNextHours);

    const displayNext = currentDistToIrk < 10 ? currentDistToIrk.toFixed(1) : Math.round(currentDistToIrk);
    const displayVlad = Math.round(currentDistToVlad);
    
    res.end(`До Иркутска: ${displayNext} км (в пути ~${timeString}) | До Владивостока: ${displayVlad} км`);
    
  } catch (e) {
    res.end('Не удалось определить местоположение (ошибка GPS)');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
