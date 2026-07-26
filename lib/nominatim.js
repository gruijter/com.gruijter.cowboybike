'use strict';

const https = require('https');

class Nominatim {

  constructor() {
    this._geoCache = null;
  }

  async reverseGeocode(lat, lon) {
    if (!lat || !lon) return null;
    const roundedLat = Number(lat).toFixed(4);
    const roundedLon = Number(lon).toFixed(4);

    if (this._geoCache && this._geoCache.lat === roundedLat && this._geoCache.lon === roundedLon) {
      return Promise.resolve(this._geoCache.address);
    }

    return new Promise((resolve) => {
      const options = {
        hostname: 'nominatim.openstreetmap.org',
        path: `/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18`,
        headers: {
          'User-Agent': 'Homey-Cowboy-App/1.0 (com.gruijter.cowboybike)',
        },
        timeout: 4000,
      };

      const req = https.get(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data && data.address) {
              const road = data.address.road || data.address.pedestrian || data.address.suburb || '';
              const number = data.address.house_number ? ` ${data.address.house_number}` : '';
              const town = data.address.town || data.address.city || data.address.village || data.address.municipality || '';
              const formatted = [road + number, town].filter(Boolean).join(', ');
              if (formatted) {
                this._geoCache = { lat: roundedLat, lon: roundedLon, address: formatted };
                return resolve(formatted);
              }
            }
            if (data && data.display_name) {
              const parts = data.display_name.split(', ');
              const formatted = parts.slice(0, 2).join(', ');
              this._geoCache = { lat: roundedLat, lon: roundedLon, address: formatted };
              return resolve(formatted);
            }
            resolve(null);
          } catch (e) {
            resolve(null);
          }
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }

}

module.exports = Nominatim;
