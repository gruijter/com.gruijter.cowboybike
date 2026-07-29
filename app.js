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

        const jsonString = this.prunePayload(payload, 490);
        return { json_data: jsonString };
      });
    } catch (e) {
      this.error('Failed to register get_json_info action card:', e);
    }
  }

  prunePayload(inputPayload, maxLength = 490) {
    if (!inputPayload || typeof inputPayload !== 'object') return '{}';

    try {
      let data = JSON.parse(JSON.stringify(inputPayload));

      const cleanNulls = (obj) => {
        if (Array.isArray(obj)) {
          return obj.map(cleanNulls).filter((v) => v !== null && v !== undefined);
        }
        if (obj !== null && typeof obj === 'object') {
          Object.keys(obj).forEach((key) => {
            if (obj[key] === null || obj[key] === undefined) {
              delete obj[key];
            } else {
              obj[key] = cleanNulls(obj[key]);
            }
          });
        }
        return obj;
      };

      data = cleanNulls(data);
      let str = JSON.stringify(data);
      if (str.length <= maxLength) return str;

      const stripKeys = (obj, keysToRemove) => {
        if (Array.isArray(obj)) {
          obj.forEach((item) => stripKeys(item, keysToRemove));
        } else if (obj !== null && typeof obj === 'object') {
          keysToRemove.forEach((key) => delete obj[key]);
          Object.values(obj).forEach((val) => stripKeys(val, keysToRemove));
        }
      };

      // Pass 1: Heavy marketing blobs, URLs, media links, and tokens
      const heavyKeys = [
        'app_texts', 'qover_insurance_info_url', 'qover_general_conditions_url',
        'purchase_link', 'cowboy_product_page_url', 'image_url', 'video_url',
        'avatars', 'avatar_url', 'cover_url', 'profile_link', 'facebook_profile_url',
        'instagram_username', 'facebook_username', 'instagram_profile_url',
        'intercom_token', 'push_token', 'country_specific', 'included',
        'available_bikes', 'shopify_product_id', 'shopify_order_id',
      ];
      stripKeys(data, heavyKeys);
      str = JSON.stringify(data);
      if (str.length <= maxLength) return str;

      // Pass 2: Secondary lists and redundant metadata
      const secondaryKeys = [
        'available_plans', 'all_possible_plans', 'available_languages',
        'referral_program', 'insurance_conditions', 'ineligibility_reasons',
        'contract', 'partner_warranty_provider_info', 'debug_logs',
      ];
      stripKeys(data, secondaryKeys);
      str = JSON.stringify(data);
      if (str.length <= maxLength) return str;

      // Pass 3: Simplify nested complex objects
      if (data.model && typeof data.model === 'object') {
        data.model = data.model.name || 'Cowboy';
      }
      if (data.sku && typeof data.sku === 'object') {
        delete data.sku.features;
        delete data.sku.available_sku_conversion;
      }
      if (data.position && typeof data.position === 'object') {
        delete data.position.id;
        delete data.position.received_at;
        delete data.position.created_at;
        delete data.position.address;
      }
      delete data.autonomies;
      delete data.pending_settings;
      delete data.active_subscriptions;
      delete data.subscription;
      delete data.crash_detection;

      str = JSON.stringify(data);
      if (str.length <= maxLength) return str;

      // Pass 4: Progressive removal of low-priority properties
      const lowestPriorityKeys = [
        'activated_at', 'warranty_started_at', 'warranty_ends_at', 'seen_at',
        'passkey', 'duration_modifier', 'human_efficiency_factor', 'investor_number',
        'biography', 'social_features', 'sync_apple_health', 'sync_google_fit', 'sync_strava',
        'brake_type', 'brake_pads_type', 'frame_type', 'torque_sensor_type', 'sku_code',
      ];

      for (const key of lowestPriorityKeys) {
        delete data[key];
        str = JSON.stringify(data);
        if (str.length <= maxLength) return str;
      }

      // Pass 5: Remove top-level keys until it fits
      const keys = Object.keys(data);
      while (keys.length > 0 && JSON.stringify(data).length > maxLength) {
        const keyToRemove = keys.pop();
        delete data[keyToRemove];
      }

      return JSON.stringify(data);
    } catch (e) {
      return '{}';
    }
  }

}

module.exports = MyApp;
