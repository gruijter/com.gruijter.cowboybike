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

    return {
      id: device.getData() ? device.getData().id : device.id,
      name: device.getName(),
      measure_battery: device.getCapabilityValue('measure_battery') ?? 0,
      meter_range: device.getCapabilityValue('meter_range') ?? 0,
      meter_trip: device.getCapabilityValue('meter_trip') ?? 0,
      meter_speed: device.getCapabilityValue('meter_speed') ?? 0,
      meter_odo: device.getCapabilityValue('meter_odo') ?? 0,
      location: device.getCapabilityValue('location') ?? '',
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
