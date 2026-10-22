const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

// Координаты
const KRASNOYARSK = { lat: 56.0153, lon: 92.8932 };
const IRKUTSK = { lat: 52.2870, lon: 104.3050 };
const VLADIVOSTOK = { lat: 43.1155, lon: 131.8855 };

// Реальные расстояния по трассам (в км)
const ROAD_TO_IRKUTSK = 1060; 
const ROAD_TO_VLADIVOSTOK = 4836; // От Красноярска до Владивостока

// Общий пробег от Москвы
const TOTAL_FROM_MOSCOW = 9000;
const PASSED_FROM_MOSCOW = 4170; // Текущий пробег

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
    
    // === ДО ИРКУТСКА ===
    const straightToIrkutskTotal = haversine(KRASNOYARSK.lat, KRASNOYARSK.lon, IRKUTSK.lat, IRKUTSK.lon);
    const straightToIrkutskRemaining = haversine(lat, lon, IRKUTSK.lat, IRKUTSK.lon);
    let fractionToIrkutsk = 1 - (straightToIrkutskRemaining / straightToIrkutskTotal);
    fractionToIrkutsk = Math.max(0, Math.min(1, fractionToIrkutsk));
    let distToIrkutsk = ROAD_TO_IRKUTSK * (1 - fractionToIrkutsk);
    if (distToIrkutsk > ROAD_TO_IRKUTSK) distToIrkutsk = ROAD_TO_IRKUTSK;

    // === ДО ВЛАДИВОСТОКА ===
    const straightToVladTotal = haversine(KRASNOYARSK.lat, KRASNOYARSK.lon, VLADIVOSTOK.lat, VLADIVOSTOK.lon);
    const straightToVladRemaining = haversine(lat, lon, VLADIVOSTOK.lat, VLADIVOSTOK.lon);
    let fractionToVlad = 1 - (straightToVladRemaining / straightToVladTotal);
    fractionToVlad = Math.max(0, Math.min(1, fractionToVlad));
    let distToVlad = ROAD_TO_VLADIVOSTOK * (1 - fractionToVlad);
    if (distToVlad > ROAD_TO_VLADIVOSTOK) distToVlad = ROAD_TO_VLADIVOSTOK;

    // Форматируем
    const displayIrk = distToIrkutsk < 10 ? distToIrkutsk.toFixed(1) : Math.round(distToIrkutsk);
    const displayVlad = distToVlad < 10 ? distToVlad.toFixed(1) : Math.round(distToVlad);
    
    // Расчет оставшегося до Владивостока (общий)
    const remainingToVladTotal = TOTAL_FROM_MOSCOW - PASSED_FROM_MOSCOW;

    res.end(`До Иркутска: ${displayIrk} км | До Владивостока: ${displayVlad} км (всего осталось ${remainingToVladTotal} км)`);
    
  } catch (e) {
    res.end('Не удалось определить местоположение (ошибка GPS)');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
