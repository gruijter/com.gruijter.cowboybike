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

const https = require('https');

const defaultHost = 'app-api.cowboy.bike';
const defaultPort = 443;
const defaultTimeout = 20000;
const appToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';

const checkUserEP = '/users/check';
const loginEP = '/auth/sign_in';
const logoutEP = '/auth/sign_out';
const meEP = '/users/me';
const bikesEP = '/bikes'; // '/bikes/{bikeId}';
const tripsRecentEP = '/trips/recent';
const releasesEP = '/releases';
// const badgesEP = '/users/me/badges';
// const badgesRecentEP = '/users/me/badges/recent';
// const prEP = '/users/me/personal_records';
// const placesEP = '/users/me/places';
// const companionsEP = '/users/me/smart_companions';
// const nickNamesEP = '/bikes/nicknames';
// const tripsOffsetEP = '/trips/offset';
// const tripsMetricsEP = '/trips/metrics/stats';
// const tripsHighlightsEP = '/trips/highlights';
// const diagnosticsEP = '/diagnostics/help';
// const dfcsOffsetEP = '/dfcs/offset';
// const crashesCurrentEP = '/crashes/current';
// const theftEP = '/theft';
// const weatherEP = '/weather';

// Represents a session to the Cowboy API.
class Cowboy {

  constructor(opts) {
    const options = opts || {};
    this.email = options.email;
    this.password = options.password;
    this.host = defaultHost;
    this.port = defaultPort;
    this.timeout = options.timeout || defaultTimeout;
    this.lastResponse = undefined;
    this.data = undefined;

    this.appToken = appToken;
    this.client = undefined;
    this.uid = undefined;
    this.accessToken = undefined;
    this.expiry = undefined;

    this.bikeId = undefined;
    this.model = undefined;
    this.serial = undefined;
    this.nickname = undefined;
  }

  async checkUser({ email }) {
    try {
      const data = { email };
      const res = await this._makeRequest(checkUserEP, data);
      return Promise.resolve(res.exists);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async login(opts) {
    try {
      const options = opts || {};
      const email = options.email || this.email;
      const password = options.password || this.password;
      this.email = email;
      this.password = password;
      const data = { email, password };
      const res = await this._makeRequest(loginEP, data);
      this.data = res.data;
      if (res.data.bike) {
        this.bikeId = res.data.bike.id;
        this.nickname = res.data.bike.nickname;
        this.serial = res.data.bike.serial_number;
        this.model = res.data.bike.model && res.data.bike.model.name;
      }
      return Promise.resolve(res.data);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async logout() {
    try {
      await this._makeRequest(logoutEP);
      return Promise.resolve(true);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async getMe() {
    try {
      const res = await this._makeRequest(meEP);
      this.data = res;
      return Promise.resolve(res);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async getBike() {
    try {
      const res = await this._makeRequest(`${bikesEP}/${this.bikeId}`);
      return Promise.resolve(res);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async getBikeStatus() {
    try {
      const data = 'null';
      const res = await this._makeRequest(`${bikesEP}/${this.bikeId}/status`, data);
      return Promise.resolve(res);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async getRecentTrips() {
    try {
      const res = await this._makeRequest(tripsRecentEP);
      return Promise.resolve(res);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async getReleases() {
    try {
      const res = await this._makeRequest(releasesEP);
      return Promise.resolve(res);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async getPlaces() {
    try {
      const res = await this._makeRequest('/users/me/places');
      return Promise.resolve(res);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async getTripMetrics() {
    try {
      const res = await this._makeRequest('/trips/metrics/stats');
      return Promise.resolve(res);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async getPersonalRecords() {
    try {
      const res = await this._makeRequest('/users/me/personal_records');
      return Promise.resolve(res);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  async _makeRequest(actionPath, data, timeout, isRetry) {
    try {
      // check if logged in and not expired
      if ((actionPath !== loginEP && actionPath !== checkUserEP)) {
        if (!this.accessToken || !this.client || this.expiry < Date.now() / 1000) await this.login();
      }
      const postData = JSON.stringify(data);
      const headers = {
        'Content-Type': 'application/json',
        'Client-Type': 'Android-App',
        'X-Cowboy-App-Token': this.appToken,
      };
      if (this.client) headers.Client = this.client;
      if (this.uid) headers.Uid = this.uid;
      if (this.accessToken) headers['Access-Token'] = this.accessToken;
      const options = {
        hostname: this.host,
        port: this.port,
        path: actionPath,
        headers,
        method: 'GET',
      };
      if (data && data !== '') options.method = 'POST';
      if (actionPath === logoutEP) options.method = 'DELETE';
      const result = await this._makeHttpsRequest(options, postData, timeout);
      this.lastResponse = result.body || result.statusCode;
      const contentType = result.headers['content-type'];
      if (!/application\/json/.test(contentType)) {
        throw Error(`Expected json but received ${contentType}: ${result.body}`);
      }

      // Attempt automatic re-login retry on 401 Unauthorized
      if (result.statusCode === 401 && !isRetry && actionPath !== loginEP && actionPath !== checkUserEP) {
        await this.login();
        return await this._makeRequest(actionPath, data, timeout, true);
      }

      // find errors
      if (result.statusCode !== 200) {
        this.lastResponse = result.statusCode;
        let errMsg = `Status Code: ${result.statusCode}`;
        try {
          const errJson = JSON.parse(result.body);
          if (errJson && (errJson.error || errJson.errors || errJson.message)) {
            errMsg += ` - ${JSON.stringify(errJson.errors || errJson.error || errJson.message)}`;
          }
        } catch (e) {
          // ignore parse error
        }
        throw Error(`HTTP request Failed. ${errMsg}`);
      }
      // capture session token and expiry
      this.uid = result.headers.uid;
      this.accessToken = result.headers['access-token'];
      this.client = result.headers.client;
      this.expiry = result.headers.expiry;
      const json = JSON.parse(result.body);
      // console.dir(json, { depth: null });
      return Promise.resolve(json);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  _makeHttpsRequest(options, postData, timeout) {
    return new Promise((resolve, reject) => {
      const opts = options;
      opts.timeout = timeout || this.timeout;
      const req = https.request(opts, (res) => {
        let resBody = '';
        res.on('data', (chunk) => {
          resBody += chunk;
        });
        res.once('end', () => {
          this.lastResponse = resBody;
          if (!res.complete) {
            return reject(Error('The connection was terminated while the message was still being sent'));
          }
          res.body = resBody;
          return resolve(res);
        });
      });
      req.on('error', (e) => {
        req.destroy();
        this.lastResponse = e;
        return reject(e);
      });
      req.on('timeout', () => {
        req.destroy();
      });
      req.end(postData);
    });
  }

}

module.exports = Cowboy;

// // START TEST HERE
// const test = async () => {
//   // const tmpCB = new Cowboy();
//   // const knownUser = await tmpCB.checkUser({ email: 'test@user.com' });
//   // console.dir(knownUser, { depth: null });
//   // const CB = new Cowboy({ email: 'test@user.com', password: 'v3rys3cr3t' });
//   console.log('REMOVE CREDENTIALS!');
//   // await CB.login();
//   const me = await CB.getMe();
//  console.dir(me, { depth: null });
//   // await CB.logout();
//   // const bike = await CB.getBike();
//  // console.dir(bike, { depth: null });
//   // const bikeStatus = await CB.getBikeStatus();
//  // console.dir(bikeStatus, { depth: null });
//   // const trips = await CB.getRecentTrips();
//  // console.dir(trips, { depth: null });
//   // const releases = await CB.getReleases();
//  // console.dir(releases, { depth: null });

// };

// test();

/* login response:
headers:
{
  server: 'Cowboy',
  date: 'Sat, 24 Sep 2020 13:42:49 GMT',
  connection: 'close',
  'x-frame-options': 'SAMEORIGIN',
  'x-xss-protection': '1; mode=block',
  'x-content-type-options': 'nosniff',
  'x-download-options': 'noopen',
  'x-permitted-cross-domain-policies': 'none',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'content-type': 'application/json; charset=utf-8',
  'access-token': 'xxxxxxxxxxx',
  'token-type': 'Bearer',
  client: 'xxxxxxxxx',
  expiry: '1695476569',
  uid: 'user@mail.com',
  etag: 'W/"xxxxxxxxxxxxxxx"',
  'cache-control': 'max-age=0, private, must-revalidate',
  'x-request-id': 'aabbccdd-abcd-1234-a1b2-aabbccddeeff',
  'x-runtime': '0.365769',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'transfer-encoding': 'chunked',
  via: '1.1 vegur'
}

login / me:
{
  data: {
    id: 12345,
    email: 'user@mail.com',
    phone_number: '+32xxxxxx',
    provider: 'email',
    settings: {
      referral_program: true,
      distance_units: 'kilometers',
      temperature_units: 'celsius',
      weight_units: 'kilograms'
    },
    facebook_profile_url: null,
    instagram_username: null,
    investor_number: null,
    country_code: 'NL',
    uid: 'user@mail.com',
    created_at: '2020-01-22T00:04:56.123+02:00',
    updated_at: '2020-01-24T00:06:01.456+02:00',
    role: 'user',
    first_name: 'XXX',
    last_name: 'XXXXX',
    nickname: null,
    uuid: 'aabbccdd-abcd-1234-a1b2-aabbccddeeff',
    biography: null,
    sync_apple_health: false,
    sync_google_fit: false,
    profile_link: 'https://cowboy.page.link/xxxx',
    sync_strava: false,
    total_distance: 0,
    total_duration: 0,
    total_co2_saved: 0,
    first_bike_assigned_at: '22020-01-24T00:06:01.456+02:00',
    intercom_token: 'a1b2c3xxxxxxxxxxxxxxxx',
    subscription: null,
    active_subscriptions: [],
    crash_detection: {
      contacts: [
        {
          id: 67890,
          full_name: 'Not Me',
          phone_number: '+32xxxx',
          client_language: 'nl'
        }
      ],
      max_contacts: 2
    },
    available_plans: [
      {
        name: 'Cowboy Care',
        type: 'care',
        price: 24000,
        currency: 'EUR',
        period: 12,
        qover_insurance_info_url: 'https://nl.cowboy.com/products/cowboy-care?attributes%5Bbackend_user_idxxxxxxxxxx',
        qover_general_conditions_url: 'https://nl.cowboy.com/products/cowboy-care?attributes%5Bbackend_user_id%5D=xxxxxxx',
        purchase_link: 'https://nl.cowboy.com/products/cowboy-care?attributes%5Bbackend_user_id%5D=xxxx',
        app_texts: {
          title: 'Cowboy Care',
          image_url: 'https://s3.eu-west-3.amazonaws.com/app.cowboy.bike/assets/cowboy_care_header.webp',
          description: 'Keep your bike in perfect shape with our on-demand maintenance service with Cowboy-trained technicians. Now available in 22 cities globally and expanding rapidly.',
          included: [
            {
              title: 'Unlimited bookings',
              description: 'There’s no limit to the number of appointments you can book. We’ll be there.'
            },
            {
              title: 'Mobile Service',
              description: 'An expert technician comes to the address of choice to service your bike.'
            },
            {
              title: 'Spare parts included',
              description: 'The replacement parts required to maintain your bike (brake pads, tyres, and inner tubes) are included in the cost of the subscription.'
            },
            {
              title: 'Flat tires covered',
              description: 'We take care of any puncture, replacing the inner tube or the tire, depending on the damage.'
            }
          ],
          purchase_text: 'Subscribe for €20/month*',
          asterisk_note: '* Billed annually (€240/year)'
        }
      }
    ],
    available_languages: [ 'en', 'fr', 'nl', 'de' ],
    human_efficiency_factor: 0.2390057361376673,
    referral_link: null,
    social_features: false,
    emergency_phone_number: '112',
    avatar_url: null,
    avatars: null,
    cover_url: null,
    instagram_profile_url: null,
    facebook_username: null,
    strava_authorized: false,
    bike: {
      id: 23415,
      mac_address: 'ABCDEF00',
      stolen: false,
      firmware_version: 'v4.15.0',
      activated_at: '2020-01-24T00:06:01.456+02:00',
      passkey: '123456',
      nickname: 'MyBike',
      crashed: false,
      seen_at: '2020-19-24T12:23:13.009+02:00',
      sku_code: 'CBA2590BK1-12',
      last_crash_started_at: null,
      autonomy: 55.7976207958003,
      battery_state_of_charge_updated_at: '2020-19-24T12:23:13.009+02:00',
      battery_state_of_charge: 87,
      pcb_battery_state_of_charge: 81,
      serial_number: 'HGFLLIG0000',
      total_distance: 1634.14000754058,
      total_duration: 299238,
      total_co2_saved: 204268,
      position: {
        latitude: 0.01,
        longitude: 0.01,
        accuracy: 1.97000002861023,
        created_at: '2020-09-24T12:23:13.335+02:00',
        received_at: '2020-09-24T12:23:08.000+02:00',
        address: 'xxxxxx',
        source: 'bike',
        elevation: null,
        id: 123456789,
        type: 'stolen'
      },
      insurance_conditions: {
        starts_at: '2020-09-24T12:23:13.335+02:00',
        min_trip_distance: 2,
        passed: true
      },
      available_features: { theft_alerts: false, auto_unlock: true, crash_detection: true },
      duration_modifier: 1.5,
      model: { name: 'Cowboy 3', description: 'Cowboy 3' },
      sku: {
        code: 'CBA2590BK1-12',
        features: {
          battery_autonomy: 70,
          available_sku_conversion: null,
          default_ble_passkey: '',
          battery_leds: 5,
          available_speeds: { default: 28, offroad: null },
          displayed_speeds: { default: 25, offroad: null },
          throttle_off_voltage: 0.65,
          has_wireless_charger: false,
          modbus_devices: [ 1, 4, 10 ]
        },
        market: 'UK',
        color: 'Absolute Black',
        color_hex: '#0C0D0D'
      },
      settings: {
        theft_alerts: false,
        auto_unlock: true,
        crash_detection: true,
        led_brightness: 100,
        manual_unlock: 20,
        auto_lock: 2,
        max_speed: 28,
        brake_light_sensitivity: null
      },
      pending_settings: {}
    }
  }
}

bikes:
=== me.bike

bikeStatus:
{
  battery_temperature: null,
  battery_state_of_charge: null,
  faults: null,
  faults2: null,
  created_at: '2024-11-11T13:47:11.533+01:00',
  pcb_battery_voltage: null,
  pcb_battery_state_of_charge: null,
  battery_voltage: null,
  received_at: '2024-11-11T13:47:11.533+01:00',
  temperature: null,
  humidity: null,
  max_battery_temperature: {},
  uptime: null,
  warnings: null,
  source: 'app',
  id: 1234567890
}

releases:
{
  firmware: {
    id: 6654,
    name: 'v4.16.5',
    status: 'deployed',
    deployed_at: '2023-12-20T11:58:38.705+01:00',
    application_file_name: 'CowboyFW_A2-app-release-v4.16.5.zip',
    mandatory: false,
    comment: 'We hebben je fiets verbeterd.\r\n' +
      '\r\n' +
      'Wanneer je batterij 5% lading heeft bereikt en twee dagen niet is gebruikt, gaat deze in diepe slaap om de levensduur te verlengen.\r\n' +
      '\r\n' +
      'Laad hem op om hem weer te activeren, zodat uw batterij in topconditie blijft, zelfs tijdens inactiviteit, zodat u altijd klaar bent om te rijden.',
    url: 'https://s3-eu-west-2.amazonaws.com/cowboy.bike/releases/applications/000/006/654/original/CowboyFW_A2-app-release-v4.16.5.zip?1698434862'
  },
  battery: {
    id: 5,
    battery_firmware_version: 52,
    battery_hardware_version: 13,
    status: 'deployed',
    deployed_at: '2020-09-21T16:27:56.167+02:00',
    application_file_name: 'HW13_V52.bin',
    name: 'v52',
    comment: 'Langere levensduur batterij',
    url: 'https://s3-eu-west-2.amazonaws.com/cowboy.bike/battery/releases/applications/000/000/005/original/HW13_V52.bin?1586511725'
  },
  controller: {
    current_version: 8,
    latest_version: 7,
    comment: 'Verbeterde prestaties en bugfixes',
    registers: []
  },
  cockpit: null,
  wireless_charger: null
}

*/
