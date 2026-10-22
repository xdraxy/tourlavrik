const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

// Координаты ключевых точек
const KRASNOYARSK = { lat: 56.0153, lon: 92.8932 };
const IRKUTSK = { lat: 52.2870, lon: 104.3050 };
const VLADIVOSTOK = { lat: 43.1155, lon: 131.8855 };

// Реальные дорожные расстояния (км)
const ROAD_KRAS_TO_IRK = 1060;
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
    
    // 1. Проверяем, насколько мы близко к Красноярску
    const distToKras = haversine(lat, lon, KRASNOYARSK.lat, KRASNOYARSK.lon) / 1000;
    
    let nextCityName = "Иркутска";
    let distNext = 0;
    let distVlad = 0;

    // ИЗМЕНЕНО: Если мы в радиусе 50 км от Красноярска, считаем строго до Иркутска
    if (distToKras < 50) {
      
      // Считаем до Иркутска
      const straightTotal = haversine(KRASNOYARSK.lat, KRASNOYARSK.lon, IRKUTSK.lat, IRKUTSK.lon);
      const straightRemaining = haversine(lat, lon, IRKUTSK.lat, IRKUTSK.lon);
      
      let fraction = 1 - (straightRemaining / straightTotal);
      fraction = Math.max(0, Math.min(1, fraction));
      
      distNext = ROAD_KRAS_TO_IRK * (1 - fraction);
      if (distNext > ROAD_KRAS_TO_IRK) distNext = ROAD_KRAS_TO_IRK;

      // Считаем до Владивостока (от Красноярска)
      const straightTotalVlad = haversine(KRASNOYARSK.lat, KRASNOYARSK.lon, VLADIVOSTOK.lat, VLADIVOSTOK.lon);
      const straightRemainingVlad = haversine(lat, lon, VLADIVOSTOK.lat, VLADIVOSTOK.lon);
      
      let fractionVlad = 1 - (straightRemainingVlad / straightTotalVlad);
      fractionVlad = Math.max(0, Math.min(1, fractionVlad));
      
      distVlad = ROAD_KRAS_TO_VLAD * (1 - fractionVlad);
      if (distVlad > ROAD_KRAS_TO_VLAD) distVlad = ROAD_KRAS_TO_VLAD;

    } else {
      // Если мы уехали дальше 50 км от Красноярска
      const distToIrkutsk = haversine(lat, lon, IRKUTSK.lat, IRKUTSK.lon) / 1000;
      const distToUlanUde = haversine(lat, lon, 51.8335, 107.5841) / 1000; // Улан-Удэ
      
      if (distToIrkutsk < distToUlanUde) {
         nextCityName = "Иркутска";
         distNext = ROAD_KRAS_TO_IRK - (haversine(KRASNOYARSK.lat, KRASNOYARSK.lon, lat, lon) / 1000);
      } else {
         nextCityName = "Улан-Удэ";
         distNext = 460 - (distToIrkutsk);
      }
      
      if (distNext < 0) distNext = 0;

      // Считаем до Владивостока
      const straightTotalVlad = haversine(KRASNOYARSK.lat, KRASNOYARSK.lon, VLADIVOSTOK.lat, VLADIVOSTOK.lon);
      const straightRemainingVlad = haversine(lat, lon, VLADIVOSTOK.lat, VLADIVOSTOK.lon);
      let fractionVlad = 1 - (straightRemainingVlad / straightTotalVlad);
      fractionVlad = Math.max(0, Math.min(1, fractionVlad));
      distVlad = ROAD_KRAS_TO_VLAD * (1 - fractionVlad);
    }

    const displayNext = distNext < 10 ? distNext.toFixed(1) : Math.round(distNext);
    const displayVlad = Math.round(distVlad);
    
    res.end(`До ${nextCityName}: ${displayNext} км | До Владивостока: ${displayVlad} км`);
    
  } catch (e) {
    res.end('Не удалось определить местоположение (ошибка GPS)');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
