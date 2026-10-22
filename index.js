const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

const IRKUTSK = { lat: 52.2870, lon: 104.3050 };
const VLADIVOSTOK = { lat: 43.1155, lon: 131.8855 };

// Твои текущие данные
const CURRENT_ROAD_TO_IRK = 609; // Осталось по трассе
// Расстояние по прямой от текущей точки до Иркутска (примерно, для калибровки)
// Если они проехали 880 - 609 = 271 км от Красноярска, до Иркутска по прямой около 500 км.
// Мы будем вычислять это динамически.

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

    // 1. Считаем расстояние по прямой от текущей точки до Иркутска (в км)
    const straightToIrk = haversine(lat, lon, IRKUTSK.lat, IRKUTSK.lon) / 1000;
    
    // 2. Калибровка: мы знаем, что когда по дороге остается 609 км, 
    // по прямой обычно остается около 470-490 км (трасса петляет).
    // Коэффициент перевода прямой в дорогу примерно 1.25 (или 609 / ~487).
    // Давай возьмем коэффициент 1.25 (стандартный для таких трасс).
    const ROAD_FACTOR = 1.25; 
    
    // Итоговое расстояние по дороге
    let distToIrk = straightToIrk * ROAD_FACTOR;
    
    // Чтобы в момент калибровки показывало ровно 609, подгоним:
    // Сейчас нужно, чтобы straightToIrk * 1.25 было равно 609 (или близко).
    // Если текущее реальное расстояние по прямой меньше, скрипт сам уменьшит.

    // Если вдруг скрипт насчитал больше, чем 609 (например, из-за того что они стоят),
    // не даем цифре расти (она должна только уменьшаться).
    // Но так как мы считаем от координат, цифра будет честной.

    // 3. Расстояние до Владивостока
    const straightToVlad = haversine(lat, lon, VLADIVOSTOK.lat, VLADIVOSTOK.lon) / 1000;
    // От текущей точки до Владивостока коэффициент примерно такой же (1.35, там горы)
    const distToVlad = straightToVlad * 1.35;

    // 4. Время
    const timeToNextHours = distToIrk / calcSpeed;
    const timeString = formatTime(timeToNextHours);

    const displayNext = distToIrk < 10 ? distToIrk.toFixed(1) : Math.round(distToIrk);
    const displayVlad = Math.round(distToVlad);
    
    res.end(`До Иркутска: ${displayNext} км (в пути ~${timeString}) | До Владивостока: ${displayVlad} км`);
    
  } catch (e) {
    res.end('Не удалось определить местоположение (ошибка GPS)');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
