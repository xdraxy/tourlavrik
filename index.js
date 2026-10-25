const http = require('http');
const https = require('https');

const PULL_KEY = 'cjughse8qx7qm872';

// Координаты городов
const CITIES = {
  IRKUTSK:   { lat: 52.2870, lon: 104.3050, name: 'Иркутска', nextName: 'Улан-Удэ' },
  ULAN_UDE:  { lat: 51.8335, lon: 107.5841, name: 'Улан-Удэ', nextName: 'Читы' },
  CHITA:     { lat: 52.0340, lon: 113.4994, name: 'Читы', nextName: 'Благовещенска' },
  BLAG:      { lat: 50.2907, lon: 127.5272, name: 'Благовещенска', nextName: 'Хабаровска' },
  KHAB:      { lat: 48.4827, lon: 135.0838, name: 'Хабаровска', nextName: 'Владивостока' },
  VLAD:      { lat: 43.1155, lon: 131.8855, name: 'Владивостока', nextName: 'ФИНИШ' }
};

// Расстояния по трассе (км) между этими городами
const DISTANCES = {
  IRKUTSK_ULAN:  460,  // Иркутск - Улан-Удэ
  ULAN_CHITA:    670,  // Улан-Удэ - Чита (по твоим данным)
  CHITA_BLAG:    1150, // Чита - Благовещенск (по твоим данным)
  BLAG_KHAB:     720,  // Благовещенск - Хабаровск
  KHAB_VLAD:     770   // Хабаровск - Владивосток
};

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
    
    let message = "";

    // Проверяем расстояние по прямой до Читы
    const distToChita = haversine(lat, lon, CITIES.CHITA.lat, CITIES.CHITA.lon) / 1000;
    
    // Если до Читы по прямой меньше 40 км (значит мы уже практически в ней)
    if (distToChita < 40) {
      // Едем от Читы до Благовещенска
      const straightTotal = haversine(CITIES.CHITA.lat, CITIES.CHITA.lon, CITIES.BLAG.lat, CITIES.BLAG.lon) / 1000;
      const straightDone = haversine(lat, lon, CITIES.BLAG.lat, CITIES.BLAG.lon) / 1000;
      let fraction = 1 - (straightDone / straightTotal);
      fraction = Math.max(0, Math.min(1, fraction));
      
      let dist = DISTANCES.CHITA_BLAG * (1 - fraction);
      if (dist > DISTANCES.CHITA_BLAG) dist = DISTANCES.CHITA_BLAG;
      
      const display = dist < 10 ? dist.toFixed(1) : Math.round(dist);
      message = `Мы находимся (выехали) с ${CITIES.CHITA.name}, до ${CITIES.CHITA.nextName} осталось ${display} км`;
      
    } else {
      // Мы на пути от Улан-Удэ к Чите
      const straightTotal = haversine(CITIES.ULAN_UDE.lat, CITIES.ULAN_UDE.lon, CITIES.CHITA.lat, CITIES.CHITA.lon) / 1000;
      const straightDone = haversine(lat, lon, CITIES.CHITA.lat, CITIES.CHITA.lon) / 1000;
      
      let fraction = 1 - (straightDone / straightTotal);
      fraction = Math.max(0, Math.min(1, fraction));
      
      let dist = DISTANCES.ULAN_CHITA * (1 - fraction);
      if (dist > DISTANCES.ULAN_CHITA) dist = DISTANCES.ULAN_CHITA;
      
      const display = dist < 10 ? dist.toFixed(1) : Math.round(dist);
      message = `Мы находимся (выехали) с ${CITIES.ULAN_UDE.name}, до ${CITIES.ULAN_UDE.nextName} осталось ${display} км`;
    }

    res.end(message);
    
  } catch (e) {
    res.end('Не удалось определить местоположение (ошибка GPS)');
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on ${PORT}`));
