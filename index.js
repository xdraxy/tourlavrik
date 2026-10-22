const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

// Жестко задаем координаты Иркутска и расстояние по трассе от Красноярска
const IRKUTSK = { name: 'Иркутска', lat: 52.2870, lon: 104.3050 };
const ROAD_FROM_KRASNOYARSK_TO_IRKUTSK = 1060; 

// Координаты Красноярска (отправная точка)
const KRASNOYARSK = { lat: 56.0153, lon: 92.8932 };

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
    
    // 1. Считаем расстояние по прямой от Красноярска до Иркутска
    const straightTotal = haversine(KRASNOYARSK.lat, KRASNOYARSK.lon, IRKUTSK.lat, IRKUTSK.lon);
    
    // 2. Считаем расстояние по прямой от текущей точки блогеров до Иркутска
    const straightRemaining = haversine(lat, lon, IRKUTSK.lat, IRKUTSK.lon);
    
    // 3. Вычисляем, сколько они уже проехали (в пропорции)
    // Если они в Красноярске, то remaining = total, прогресс = 0.
    // Чем ближе к Иркутску, тем меньше remaining.
    let fractionDone = 1 - (straightRemaining / straightTotal);
    
    // Ограничиваем значения от 0 до 1 (на случай если GPS скакнет)
    fractionDone = Math.max(0, Math.min(1, fractionDone));
    
    // 4. Считаем километры по дороге, умножая оставшуюся долю на 1060 км
    let distKm = ROAD_FROM_KRASNOYARSK_TO_IRKUTSK * (1 - fractionDone);
    
    // Если каким-то чудом получилось больше 1060 (глюк GPS), ставим 1060
    if (distKm > ROAD_FROM_KRASNOYARSK_TO_IRKUTSK) distKm = ROAD_FROM_KRASNOYARSK_TO_IRKUTSK;

    const display = distKm < 10 ? distKm.toFixed(1) : Math.round(distKm);
    res.end(`До ${IRKUTSK.name} осталось ${display} км`);
    
  } catch (e) {
    res.end('Не удалось определить местоположение (ошибка GPS)');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
