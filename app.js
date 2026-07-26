/*
Copyright 2023 - 2026, Robin de Gruijter (gruijter@hotmail.com)

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

const Homey = require('homey');

class MyApp extends Homey.App {

  async onInit() {
    this.log('Cowboy app has been initialized');

    try {
      this.homey.flow.getActionCard('get_json_info').registerRunListener(async (args) => {
        if (!args || !args.device) return { json_data: '{}' };
        const targetDevice = args.device;
        const dataType = args.data_type || 'bike_status';
        let payload = {};

        if (dataType === 'bike_status') {
          payload = (targetDevice.cowboy && targetDevice.cowboy.data && targetDevice.cowboy.data.bike) || {};
        } else if (dataType === 'personal_records') {
          payload = (targetDevice._statsCache && targetDevice._statsCache.records) || {};
        } else if (dataType === 'badges_summary') {
          if (targetDevice.cowboy && typeof targetDevice.cowboy.getBadges === 'function') {
            payload = await targetDevice.cowboy.getBadges().catch(() => ({}));
          }
        } else if (dataType === 'user_profile') {
          const fullData = (targetDevice.cowboy && targetDevice.cowboy.data) || {};
          const { bike, ...userData } = fullData;
          payload = userData;
        }

        let jsonString = JSON.stringify(payload);
        if (jsonString.length > 490) {
          jsonString = jsonString.substring(0, 487) + '...';
        }
        return { json_data: jsonString };
      });
    } catch (e) {
      this.error('Failed to register get_json_info action card:', e);
    }
  }

}

module.exports = MyApp;
