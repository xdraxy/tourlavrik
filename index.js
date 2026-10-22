const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

const KRASNOYARSK = { lat: 56.0153, lon: 92.8932 };
const IRKUTSK = { lat: 52.2870, lon: 104.3050 };
const VLADIVOSTOK = { lat: 43.1155, lon: 131.8855 };

// Реальное расстояние по трассе от Красноярска до Иркутска
const ROAD_KRAS_TO_IRK = 1060;
// Расстояние от Красноярска до Владивостока
const ROAD_KRAS_TO_VLAD = 4836;

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
    
    // Скорость км/ч. Если стоят - берем 40 для расчета
    const speedKmh = speedMs * 3.6;
    const calcSpeed = speedKmh > 5 ? speedKmh : 40;

    // Расстояние от текущей точки до Иркутска по прямой
    const straightToIrk = haversine(lat, lon, IRKUTSK.lat, IRKUTSK.lon) / 1000;
    
    // Расстояние от Красноярска до Иркутска по прямой
    const straightKrasToIrk = haversine(KRASNOYARSK.lat, KRASNOYARSK.lon, IRKUTSK.lat, IRKUTSK.lon) / 1000;

    let distNext = 0;

    // Если мы находимся между Красноярском и Иркутском (то есть в пути)
    // Или если мы всё еще в Красноярске
    if (straightToIrk < straightKrasToIrk) {
      // Рассчитываем пропорцию: сколько прямых километров мы проехали от Красноярска
      let fractionDone = 1 - (straightToIrk / straightKrasToIrk);
      fractionDone = Math.max(0, Math.min(1, fractionDone));
      
      // Переводим эту пропорцию в дорожные километры
      distNext = ROAD_KRAS_TO_IRK * (1 - fractionDone);
    } else {
      // Если GPS скакнул назад, показываем полное расстояние
      distNext = ROAD_KRAS_TO_IRK;
    }

    // Расстояние до Владивостока (считаем так же пропорционально)
    const straightToVlad = haversine(lat, lon, VLADIVOSTOK.lat, VLADIVOSTOK.lon) / 1000;
    const straightKrasToVlad = haversine(KRASNOYARSK.lat, KRASNOYARSK.lon, VLADIVOSTOK.lat, VLADIVOSTOK.lon) / 1000;
    
    let fractionToVlad = 1 - (straightToVlad / straightKrasToVlad);
    fractionToVlad = Math.max(0, Math.min(1, fractionToVlad));
    let distVlad = ROAD_KRAS_TO_VLAD * (1 - fractionToVlad);
    if (distVlad > ROAD_KRAS_TO_VLAD) distVlad = ROAD_KRAS_TO_VLAD;

    // Считаем время до Иркутска
    const timeToNextHours = distNext / calcSpeed;
    const timeString = formatTime(timeToNextHours);

    const displayNext = distNext < 10 ? distNext.toFixed(1) : Math.round(distNext);
    const displayVlad = Math.round(distVlad);
    
    // Вывод: До Иркутска: 885 км (в пути ~11 ч. 30 мин.) | До Владивостока: 4660 км
    res.end(`До Иркутска: ${displayNext} км (в пути ~${timeString}) | До Владивостока: ${displayVlad} км`);
    
  } catch (e) {
    res.end('Не удалось определить местоположение (ошибка GPS)');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
