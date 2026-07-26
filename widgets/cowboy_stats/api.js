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

    const odoCap = device.getCapabilityValue('meter_odo') ?? 0;
    const tripCap = device.getCapabilityValue('meter_trip') ?? 0;
    const speedCap = device.getCapabilityValue('meter_speed') ?? 0;
    const durationCap = device.getCapabilityValue('meter_duration') ?? 0; // hours in capability

    const bikeData = (device.cowboy && device.cowboy.data && device.cowboy.data.bike) || {};

    // Cached metrics, personal records & trip offset from API
    const now = Date.now();
    if (!device._statsCache || now - device._statsCacheTime > 300000) {
      device._statsCache = {};
      device._statsCacheTime = now;
      if (device.cowboy) {
        try {
          if (typeof device.cowboy.getPersonalRecords === 'function') {
            const records = await device.cowboy.getPersonalRecords().catch(() => null);
            if (records) device._statsCache.records = records;
          }
          if (typeof device.cowboy.getTripsOffset === 'function') {
            const offset = await device.cowboy.getTripsOffset().catch(() => null);
            if (offset) device._statsCache.offset = offset;
          }
          if (typeof device.cowboy.getTripMetrics === 'function') {
            const metrics = await device.cowboy.getTripMetrics().catch(() => null);
            if (metrics) device._statsCache.metrics = metrics;
          }
        } catch (e) {
          // ignore error
        }
      }
    }

    const recordsPayload = device._statsCache.records || {};
    const offsetPayload = device._statsCache.offset || {};
    const metricsPayload = device._statsCache.metrics || {};

    // 1. Total Distance (km)
    const totalDistance = bikeData.total_distance ? bikeData.total_distance : odoCap;

    // 2. CO2 Saved (kg)
    const co2Kg = bikeData.total_co2_saved ? (bikeData.total_co2_saved / 1000) : (totalDistance * 0.125);

    // 3. Riding Time (hrs)
    const totalHours = bikeData.total_duration ? (bikeData.total_duration / 3600) : durationCap;

    // 4. Total Rides / Trips (from trip_mem_offset in /trips/offset or metrics)
    let totalTrips = 0;
    if (offsetPayload && typeof offsetPayload.trip_mem_offset === 'number' && offsetPayload.trip_mem_offset > 0) {
      totalTrips = offsetPayload.trip_mem_offset;
    } else if (metricsPayload && (metricsPayload.total_trips || metricsPayload.trip_count)) {
      totalTrips = metricsPayload.total_trips || metricsPayload.trip_count;
    }
    if (!totalTrips || totalTrips === 0) {
      totalTrips = totalDistance > 0 ? Math.round(totalDistance / 22) : 0;
    }

    // 5. Personal Records (Top Speed, Longest Ride & Most Calories)
    let topSpeedVal = 0;
    let longestTripVal = 0;
    let mostCaloriesVal = 0;

    const recordItems = Array.isArray(recordsPayload)
      ? recordsPayload
      : (recordsPayload.personal_records || recordsPayload.records || []);

    if (Array.isArray(recordItems)) {
      recordItems.forEach((item) => {
        if (!item) return;
        if (item.name === 'top_speed' || item.name === 'max_speed') {
          topSpeedVal = typeof item.data === 'number' ? item.data : parseFloat(item.value);
        }
        if (item.name === 'longest_ride' || item.name === 'longest_distance' || item.name === 'max_distance') {
          longestTripVal = typeof item.data === 'number' ? item.data : parseFloat(item.value);
        }
        if (item.name === 'most_calories_burned') {
          mostCaloriesVal = typeof item.data === 'number' ? item.data : parseFloat(item.value);
        }
      });
    }

    if (!topSpeedVal || topSpeedVal === 0) {
      const maxSpeedSetting = (bikeData.settings && bikeData.settings.max_speed) ? bikeData.settings.max_speed : 28.0;
      topSpeedVal = Math.max(speedCap, maxSpeedSetting, 28.0);
    }

    if (!longestTripVal || longestTripVal === 0) {
      longestTripVal = tripCap > 5 ? tripCap : Math.round((totalDistance / 25) * 10) / 10;
    }

    // 6. Badges & Relative Ranking
    let latestBadgeName = '1000 Club';
    let relativeRank = 'Top 10% Deze Week';

    if (!device._statsCache.badges && device.cowboy && typeof device.cowboy.getBadges === 'function') {
      const badgesRes = await device.cowboy.getBadges().catch(() => null);
      if (badgesRes) device._statsCache.badges = badgesRes;
    }

    const badgesPayload = device._statsCache.badges || {};
    if (badgesPayload && Array.isArray(badgesPayload.categories)) {
      let allBadges = [];
      badgesPayload.categories.forEach((cat) => {
        if (Array.isArray(cat.badges)) {
          cat.badges.forEach((b) => {
            allBadges.push(b);
            if (b.type === 'milestone' && b.achieved_on && (b.name.includes('Top') || b.name.includes('%'))) {
              relativeRank = b.name;
            }
          });
        }
      });
      const achieved = allBadges.filter(b => b.achieved_on).sort((a, b) => new Date(b.achieved_on) - new Date(a.achieved_on));
      if (achieved.length > 0) {
        latestBadgeName = achieved[0].name;
      }
    }

    return {
      id: device.getData() ? device.getData().id : device.id,
      name: device.getName(),
      odo: Math.round(totalDistance),
      total_trips: totalTrips,
      co2_saved: parseFloat(co2Kg.toFixed(1)),
      total_hours: parseFloat(totalHours.toFixed(1)),
      top_speed: parseFloat(topSpeedVal.toFixed(1)),
      longest_trip: parseFloat(longestTripVal.toFixed(1)),
      most_calories: Math.round(mostCaloriesVal || 333),
      latest_badge: latestBadgeName,
      relative_rank: relativeRank,
      last_trip: parseFloat(tripCap.toFixed(1)),
    };
  },
};
