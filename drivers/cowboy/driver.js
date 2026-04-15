/*
Copyright 2023 - 2024, Robin de Gruijter (gruijter@hotmail.com)

This file is part of com.gruijter.cowboybike.

com.gruijter.cowboybike is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

com.gruijter.cowboybike is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with com.gruijter.cowboybike.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

const { Driver } = require('homey');
const Cowboy = require('../../cowboybike');

const capabilities = ['last_parked', 'location', 'meter_distance', 'etth', 'meter_range', 'meter_odo', 'meter_trip', 'meter_speed', 'meter_duration',
  'alarm_crashed', 'alarm_stolen', 'alarm_relocated', 'alarm_offline', 'alarm_batt', 'measure_battery', 'measure_battery.pcb',
  'latitude', 'longitude'];

class MyDriver extends Driver {

  async onInit() {
    this.cowboy = new Cowboy();
    this.ds = { capabilities };
    this.log('MyDriver has been initialized');
  }

  async onPair(session) {
    let email = '';
    let password = '';
    let info = false;

    session.setHandler('login', async (data) => {
      email = data.username;
      password = data.password;
      info = await this.cowboy.login({ email, password });
      return !!info;
    });

    session.setHandler('list_devices', async () => {
      if (!info || !info.bike) return [];
      this.log(info);
      const device = {
        name: info.bike.nickname,
        data: {
          id: info.bike.id,
        },
        capabilities,
        settings: {
          email,
          password,
          interval: 5,
          lat: Math.round(this.homey.geolocation.getLatitude() * 100000000) / 100000000,
          lon: Math.round(this.homey.geolocation.getLongitude() * 100000000) / 100000000,
          model: info.bike.model.name,
          sku: info.bike.sku_code,
          serial: info.bike.serial_number,
          mac: info.bike.mac_address,
          actDate: info.bike.activated_at,
          firmware: info.bike.firmware_version,
          maxSpeed: info.bike.settings.max_speed.toString(),
        },
      };
      if (info.bike.sku && info.bike.sku.features) device.settings.maxRange = info.bike.sku.features.battery_autonomy.toString();
      return [device];
    });
  }

}

module.exports = MyDriver;
