'use strict';

module.exports = {
  async getBikeData({ homey, query }) {
    const driver = homey.drivers.getDriver('cowboy');
    if (!driver) throw new Error('Cowboy driver not found');

    const devices = driver.getDevices();
    let device;

    if (query && query.deviceId) {
      const targetId = String(query.deviceId).trim();
      device = devices.find((d) => {
        const data = d.getData() || {};
        return String(d.id) === targetId || String(data.id) === targetId;
      });
    }

    if (!device && devices.length > 0) {
      device = devices[0];
    }

    if (!device) {
      return null;
    }

    let place = null;
    try {
      if (device.cowboy && typeof device.cowboy.getPlaces === 'function') {
        const places = await device.cowboy.getPlaces();
        if (Array.isArray(places) && places.length > 0) {
          const lat = device.getCapabilityValue('latitude');
          const lon = device.getCapabilityValue('longitude');
          if (lat && lon) {
            const matchedPlace = places.find((p) => {
              if (!p.latitude || !p.longitude) return false;
              const dLat = (p.latitude - lat) * 111;
              const dLon = (p.longitude - lon) * 111 * Math.cos((lat * Math.PI) / 180);
              const distKm = Math.sqrt(dLat * dLat + dLon * dLon);
              return distKm < 0.3; // Within 300 meters
            });
            if (matchedPlace) place = matchedPlace.name || matchedPlace.label;
          }
        }
      }
    } catch (e) {
      // ignore if places api not available or error
    }

    let meterSpeed = device.getCapabilityValue('meter_speed') ?? 0;
    if (meterSpeed === 0 && device._lastTripSpeed) {
      meterSpeed = device._lastTripSpeed;
    }

    const bikeData = (device.cowboy && device.cowboy.data && device.cowboy.data.bike) || {};

    return {
      id: device.getData() ? device.getData().id : device.id,
      name: device.getName(),
      measure_battery: device.getCapabilityValue('measure_battery') ?? 0,
      meter_range: device.getCapabilityValue('meter_range') ?? 0,
      meter_trip: device.getCapabilityValue('meter_trip') ?? 0,
      meter_speed: meterSpeed,
      current_speed: device.currentSpeed ?? 0,
      meter_odo: device.getCapabilityValue('meter_odo') ?? 0,
      location: device.getCapabilityValue('location') ?? '',
      place: place,
      meter_distance: device.getCapabilityValue('meter_distance') ?? 0,
      last_parked: device.getCapabilityValue('last_parked') ?? '',
      alarm_batt: device.getCapabilityValue('alarm_batt') ?? false,
      alarm_offline: device.getCapabilityValue('alarm_offline') ?? false,
      alarm_relocated: device.getCapabilityValue('alarm_relocated') ?? false,
      alarm_stolen: device.getCapabilityValue('alarm_stolen') ?? false,
      alarm_crashed: device.getCapabilityValue('alarm_crashed') ?? false,
      alarm_battery_removed: device.getCapabilityValue('alarm_battery_removed') ?? false,
      battery_inserted: typeof bikeData.battery_inserted === 'boolean' ? bikeData.battery_inserted : true,
      position_type: (bikeData.position && bikeData.position.type) ? bikeData.position.type : null,
      ride_mode: device.hasCapability('ride_mode') ? device.getCapabilityValue('ride_mode') : null,
      measure_elevation: device.hasCapability('measure_elevation') ? device.getCapabilityValue('measure_elevation') : null,
      model: (bikeData.model && bikeData.model.name) ? bikeData.model.name : (device.getSettings().model || ''),
      trip_duration: (device._lastTripDuration || (typeof device.getStoreValue === 'function' && device.getStoreValue('lastTripDuration'))) || ((device.getCapabilityValue('meter_trip') && meterSpeed) ? Math.round((device.getCapabilityValue('meter_trip') / meterSpeed) * 60) : 0),
    };
  },
};
