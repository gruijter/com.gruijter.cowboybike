'use strict';

module.exports = {
  async getBikeData({ homey, query }) {
    const driver = homey.drivers.getDriver('cowboy');
    if (!driver) throw new Error('Cowboy driver not found');

    const devices = driver.getDevices();
    let device;

    if (query && query.deviceId) {
      device = devices.find((d) => {
        const data = d.getData();
        return (data && data.id === query.deviceId) || d.id === query.deviceId;
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
    };
  },
};
