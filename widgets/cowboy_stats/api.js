'use strict';

module.exports = {
  async getStatsData({ homey, query }) {
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

    const odo = device.getCapabilityValue('meter_odo') ?? 0;
    const trip = device.getCapabilityValue('meter_trip') ?? 0;
    const speed = device.getCapabilityValue('meter_speed') ?? 0;
    const duration = device.getCapabilityValue('meter_duration') ?? 0; // seconds

    // Cached metrics from API
    const now = Date.now();
    if (!device._statsCache || now - device._statsCacheTime > 3600000) {
      device._statsCache = {};
      device._statsCacheTime = now;
      if (device.cowboy) {
        try {
          if (typeof device.cowboy.getTripMetrics === 'function') {
            const metrics = await device.cowboy.getTripMetrics().catch(() => null);
            if (metrics) device._statsCache.metrics = metrics;
          }
          if (typeof device.cowboy.getPersonalRecords === 'function') {
            const records = await device.cowboy.getPersonalRecords().catch(() => null);
            if (records) device._statsCache.records = records;
          }
        } catch (e) {
          // ignore error
        }
      }
    }

    const metrics = device._statsCache.metrics || {};
    const records = device._statsCache.records || {};

    const totalDistance = metrics.total_distance ? (metrics.total_distance / 1000) : odo;
    const totalTrips = metrics.total_trips || metrics.trip_count || 0;
    const co2Saved = (totalDistance * 0.15).toFixed(1); // 0.15kg CO2 saved per km
    const totalHours = (duration / 3600).toFixed(1);
    const topSpeed = records.max_speed ? records.max_speed.toFixed(1) : speed.toFixed(1);
    const longestTrip = records.max_distance ? (records.max_distance / 1000).toFixed(1) : trip.toFixed(1);

    return {
      id: device.getData() ? device.getData().id : device.id,
      name: device.getName(),
      odo: Math.round(totalDistance),
      total_trips: totalTrips,
      co2_saved: parseFloat(co2Saved),
      total_hours: parseFloat(totalHours),
      top_speed: parseFloat(topSpeed),
      longest_trip: parseFloat(longestTrip),
      last_trip: parseFloat(trip.toFixed(1)),
    };
  },
};
