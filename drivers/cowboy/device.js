/* eslint-disable no-await-in-loop */
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

const { Device } = require('homey');
const GeoPoint = require('geopoint');
const util = require('util');
const Cowboy = require('../../lib/cowboybike');
const Nominatim = require('../../lib/nominatim');

const setTimeoutPromise = util.promisify(setTimeout);

class MyDevice extends Device {

  async onInit() {
    try {
      await this.migrate();
      this.setAvailable().catch(this.error);
      this.setCapability('alarm_relocated', false);
      this.restarting = false;
      this.lastBikeData = this.getStoreValue('lastBikeData');
      const storedLastTripSpeed = this.getStoreValue('lastTripSpeed');
      if (storedLastTripSpeed && storedLastTripSpeed > 0) {
        this.setCapability('meter_speed', storedLastTripSpeed);
        this._lastTripSpeed = storedLastTripSpeed;
      }
      const storedLastTripDuration = this.getStoreValue('lastTripDuration');
      if (storedLastTripDuration && storedLastTripDuration > 0) {
        this._lastTripDuration = storedLastTripDuration;
      }
      const settings = this.getSettings();
      const options = {
        email: settings.email,
        password: settings.password,
      };
      this.cowboy = new Cowboy(options);
      this.nominatim = new Nominatim();
      await this.cowboy.getMe();
      this.log(JSON.stringify(this.cowboy.data));
      await this.handleData();
      this.startPolling(settings.pollInterval);
      this.log(`${this.getName()} has been initialized`);
    } catch (error) {
      this.error(error);
    }
  }

  async migrate() {
    try {
      this.log(`checking device migration for ${this.getName()}`);
      const optionalCaps = ['ride_mode', 'measure_elevation'];
      // store the capability states before migration
      const sym = Object.getOwnPropertySymbols(this).find((s) => String(s) === 'Symbol(state)');
      const state = this[sym] || {};
      // check and repair incorrect capability(order) for base capabilities
      const correctCaps = this.driver.ds.capabilities;
      for (let index = 0; index < correctCaps.length; index += 1) {
        const caps = (await this.getCapabilities()).filter((c) => !optionalCaps.includes(c));
        const newCap = correctCaps[index];
        if (caps[index] !== newCap) {
          this.setUnavailable('Migrating. Please wait!').catch(() => null);
          // remove base caps from here
          for (let i = index; i < caps.length; i += 1) {
            this.log(`removing capability ${caps[i]} for ${this.getName()}`);
            await this.removeCapability(caps[i])
              .catch((error) => this.log(error));
            await setTimeoutPromise(2 * 1000); // wait a bit for Homey to settle
          }
          // add the new cap
          if (newCap !== undefined) {
            this.log(`adding capability ${newCap} for ${this.getName()}`);
            await this.addCapability(newCap);
            // restore capability state
            if (state[newCap] !== undefined) {
              this.log(`${this.getName()} restoring value ${newCap} to ${state[newCap]}`);
              this.setCapability(newCap, state[newCap]);
            }
            await setTimeoutPromise(2 * 1000); // wait a bit for Homey to settle
          }
        }
      }
    } catch (error) {
      this.error(error);
    }
  }

  async onAdded() {
    this.log(`${this.getName()} has been added`);
  }

  async onSettings({ newSettings }) { // oldSettings, changedKeys
    this.log(`${this.getName()} settings were changed`, newSettings);
    this.restartDevice();
  }

  async onRenamed(name) {
    this.log(`${this.getName()} was renamed to ${name}`);
  }

  async onDeleted() {
    this.log(`${this.getName()} has been deleted`);
  }

  startPolling(int) {
    const interval = int || 1;
    this.log(`Start polling ${this.getName()} @ ${interval} minute interval`);
    this.stopPolling();
    this.intervalIdDevicePoll = this.homey.setInterval(async () => {
      try {
        if (this.busy) {
          this.log('skipping a poll');
          return;
        }
        this.busy = true;
        await this.cowboy.getMe();
        await this.handleData();
        this.busy = false;
      } catch (error) {
        this.busy = false;
        this.error(error);
      }
    }, 1000 * 60 * interval);
  }

  stopPolling() {
    this.homey.clearInterval(this.intervalIdDevicePoll);
  }

  restartDevice(delay) {
    // this.destroyListeners();
    if (this.restarting) return;
    this.restarting = true;
    this.stopPolling();
    const dly = delay || 1000 * 5;
    this.log(`Device will restart in ${dly / 1000} seconds`);
    // this.setUnavailable('Device is restarting');
    setTimeoutPromise(dly).then(() => this.onInit());
  }

  async checkSettings() {
    const { bike } = this.cowboy.data || {};
    if (!bike || !bike.settings) return;
    const settings = {
      model: bike.model ? bike.model.name : '',
      sku: bike.sku_code || '',
      serial: bike.serial_number || '',
      mac: bike.mac_address || '',
      actDate: bike.activated_at || '',
      firmware: bike.firmware_version || '',
      maxSpeed: bike.settings.max_speed ? `${bike.settings.max_speed} km/h` : '28 km/h',
      ledBrightness: bike.settings.led_brightness ? `${bike.settings.led_brightness}%` : '100%',
      autoUnlock: bike.settings.auto_unlock ? 'Enabled' : 'Disabled',
      smartLock: bike.settings.smart_lock ? 'Enabled' : 'Disabled',
      color: (bike.sku && bike.sku.color) ? bike.sku.color : '',
      accessories: (bike.sku && bike.sku.accessories) ? bike.sku.accessories : '',
      brakeType: bike.brake_type || '',
      brakePadsType: bike.brake_pads_type || '',
      frameType: bike.frame_type || '',
      torqueSensorType: bike.torque_sensor_type || '',
      wirelessCharger: (bike.sku && bike.sku.features && typeof bike.sku.features.has_wireless_charger === 'boolean') ? (bike.sku.features.has_wireless_charger ? 'Yes' : 'No') : '',
      warrantyEnds: bike.warranty_ends_at ? bike.warranty_ends_at.substring(0, 10) : '',
      connect: typeof bike.has_cowboy_connect === 'boolean' ? (bike.has_cowboy_connect ? 'Active' : 'Inactive') : '',
    };
    if (bike.sku && bike.sku.features && bike.sku.features.battery_autonomy) {
      settings.maxRange = `${bike.sku.features.battery_autonomy} km`;
    }
    const storedSettings = this.getSettings();
    Object.keys(settings).forEach((key) => {
      if (settings[key] !== storedSettings[key]) {
        this.setSettings(settings).catch(this.error);
      }
    });
  }

  setCapability(capability, value) {
    if (this.hasCapability(capability)) {
      // only update changed values
      if (value !== this.getCapabilityValue(capability)) {
        this.setCapabilityValue(capability, value)
          .catch((error) => {
            this.log(error, capability, value);
          });
      }
    }
  }

  async handleData() {
    try {
      if (!this.cowboy || !this.cowboy.data || !this.cowboy.data.bike) return;
      const { bike } = this.cowboy.data;
      if (bike.id !== this.getData().id) throw Error('Bike ID mismatch.');

      // update native capabilities
      this.setCapability('measure_battery', bike.battery_state_of_charge);
      this.setCapability('measure_battery.pcb', bike.pcb_battery_state_of_charge);
      this.setCapability('alarm_crashed', bike.crashed);
      this.setCapability('alarm_stolen', bike.stolen);
      if (typeof bike.battery_inserted === 'boolean') {
        this.setCapability('alarm_battery_removed', !bike.battery_inserted);
      }
      this.setCapability('meter_odo', bike.total_distance);
      this.setCapability('meter_duration', bike.total_duration / 3600);
      this.setCapability('latitude', bike.position.latitude);
      this.setCapability('longitude', bike.position.longitude);

      // dynamic capability: measure_elevation
      if (bike.position && typeof bike.position.elevation === 'number') {
        if (!this.hasCapability('measure_elevation')) {
          await this.addCapability('measure_elevation').catch(this.error);
        }
        this.setCapability('measure_elevation', Math.round(bike.position.elevation * 10) / 10);
      } else if (this.hasCapability('measure_elevation')) {
        await this.removeCapability('measure_elevation').catch(this.error);
      }

      // dynamic capability: ride_mode
      const hasRideModeFeature = (bike.available_features && bike.available_features.ride_mode === 'available') || bike.last_ride_mode;
      if (hasRideModeFeature && bike.last_ride_mode) {
        if (!this.hasCapability('ride_mode')) {
          await this.addCapability('ride_mode').catch(this.error);
        }
        const modeMap = {
          adaptive_eu: 'Adaptive (EU)',
          adaptive_us: 'Adaptive (US)',
          adaptive_eco_eu: 'Adaptive Eco (EU)',
          adaptive_eco_us: 'Adaptive Eco (US)',
          static_eu: 'Static (EU)',
          static_us: 'Static (US)',
          static_offroad: 'Offroad',
          assistance_off: 'Off',
        };
        const formattedMode = modeMap[bike.last_ride_mode] || bike.last_ride_mode;
        this.setCapability('ride_mode', formattedMode);
      } else if (this.hasCapability('ride_mode')) {
        await this.removeCapability('ride_mode').catch(this.error);
      }

      let locationAddress = bike.position.address;
      if (!locationAddress && bike.position.latitude && bike.position.longitude && this.nominatim) {
        locationAddress = await this.nominatim.reverseGeocode(bike.position.latitude, bike.position.longitude).catch(() => null);
      }
      if (!locationAddress && bike.position.latitude && bike.position.longitude) {
        locationAddress = `${bike.position.latitude.toFixed(4)}, ${bike.position.longitude.toFixed(4)}`;
      }
      if (locationAddress) {
        this.setCapability('location', locationAddress);
        this.setCapabilityValue('location', locationAddress).catch(this.error);
      }

      // update calculated capabilities
      let rangeEst = bike.autonomy * (bike.battery_state_of_charge / 100);
      if (Array.isArray(bike.autonomies) && bike.last_ride_mode) {
        const modeAutonomy = bike.autonomies.find((a) => a.ride_mode === bike.last_ride_mode);
        if (modeAutonomy && typeof modeAutonomy.full_battery_range === 'number' && modeAutonomy.full_battery_range > 0) {
          rangeEst = modeAutonomy.full_battery_range * (bike.battery_state_of_charge / 100);
        }
      }
      this.setCapability('meter_range', Math.round(rangeEst * 10) / 10);
      this.setCapability('meter_distance', this.distance(bike.position));
      this.setCapability('etth', 3.5 * this.distance(bike.position)); // assume avg 17,1 km/h

      this.setCapability('alarm_batt', bike.battery_state_of_charge < this.getSettings().batteryAlarmLevel);
      const lastSeen = new Date(bike.seen_at);
      const offline = (Date.now() - lastSeen) > this.getSettings().offlineAlarmTime * 60 * 60 * 1000;
      this.setCapability('alarm_offline', offline);

      const lastLocTm = new Date(bike.position.received_at);
      const date = lastLocTm.toString().substring(4, 11);
      const time = lastLocTm.toLocaleTimeString('nl-NL', { hour12: false, timeZone: this.homey.clock.getTimezone() }).substring(0, 5);
      if (!this.lastBikeData) this.setCapability('last_parked', `${date} ${time}`);

      // update relocation based capabilities
      if (this.lastBikeData) {
        let deltaT = bike.total_duration - this.lastBikeData.total_duration;
        let deltaD = bike.total_distance - this.lastBikeData.total_distance;
        let movedBeeline = this.distance(bike.position, this.lastBikeData.position);
        let relocatedAlarm = (movedBeeline - deltaD) > this.getSettings().relocationAlarmDistance;

        // log anomalies
        if (deltaD === 0 && deltaT !== 0) this.error('bike duration without odochange', bike, this.lastBikeData);
        if (deltaT === 0 && deltaD !== 0) this.error('odochange without bike duration', bike, this.lastBikeData);
        // if (relocatedAlarm) console.log('relocAlarm', bike, this.lastBikeData);

        // recheck in case odo is updated later on server
        if (relocatedAlarm && deltaD === 0) {
          this.log('rechecking relocated alarm');
          this.busy = true;
          await setTimeoutPromise(60 * 1000);
          await this.cowboy.getMe();
          const recheckBike = this.cowboy.data.bike;
          if (recheckBike.id !== this.getData().id) throw Error('Bike ID mismatch during recheck.');
          deltaT = recheckBike.total_duration - this.lastBikeData.total_duration;
          deltaD = recheckBike.total_distance - this.lastBikeData.total_distance;
          movedBeeline = this.distance(recheckBike.position, this.lastBikeData.position);
          relocatedAlarm = (movedBeeline - deltaD) > this.getSettings().relocationAlarmDistance;
          this.busy = false;
        }
        if (deltaT > 0 && deltaD > 0.05) {
          const speed = 3600 * (deltaD / deltaT);
          if (speed >= 3) {
            this.setCapability('meter_speed', speed);
            this.setCapabilityValue('meter_speed', speed).catch(this.error);
            this.setStoreValue('lastTripSpeed', speed).catch(this.error);
            this._lastTripSpeed = speed;
          }
          this._lastTripDuration = Math.round(deltaT / 60);
          this.currentSpeed = speed;
        } else {
          this.currentSpeed = 0;
        }
        if (deltaD > 0) {
          this.setCapability('last_parked', `${date} ${time}`);
          this.setCapability('meter_trip', deltaD);
          this.setCapability('alarm_relocated', false);
        } else if (movedBeeline > 0.25) this.setCapability('last_parked', `${date} ${time}`);
        if (relocatedAlarm) this.setCapability('alarm_relocated', true);
        // console.log(movedBeeline, relocatedAlarm);
      }

      // store bike data and update app settings
      this.lastBikeData = bike;
      this.setStoreValue('lastBikeData', bike).catch(this.error);
      await this.updateLastTripSpeed();
      await this.checkSettings();
    } catch (error) {
      this.error(error);
    }
  }

  async updateLastTripSpeed() {
    try {
      const { bike } = (this.cowboy && this.cowboy.data) || {};
      let speedCap = this.getCapabilityValue('meter_speed');
      let storedSpeed = this.getStoreValue('lastTripSpeed');

      // Filter out tiny noise values (< 3 km/h like 0.0233)
      if (typeof speedCap === 'number' && speedCap < 3) speedCap = 0;
      if (typeof storedSpeed === 'number' && storedSpeed < 3) storedSpeed = 0;

      if (speedCap === 0 && storedSpeed > 0) {
        speedCap = storedSpeed;
        this.setCapability('meter_speed', storedSpeed);
        this.setCapabilityValue('meter_speed', storedSpeed).catch(this.error);
        this._lastTripSpeed = storedSpeed;
      }

      // Try fetching recent trips if _lastTripDuration is missing or speedCap is 0
      if ((!speedCap || speedCap === 0 || !this._lastTripDuration) && this.cowboy && typeof this.cowboy.getRecentTrips === 'function') {
        const res = await this.cowboy.getRecentTrips().catch(() => null);

        let trips = null;
        if (Array.isArray(res)) trips = res;
        else if (res && Array.isArray(res.trips)) trips = res.trips;
        else if (res && Array.isArray(res.data)) trips = res.data;

        if (trips && trips.length > 0) {
          const lastTrip = trips[0];
          if (typeof lastTrip.duration === 'number' && lastTrip.duration > 0) {
            const durMin = Math.round(lastTrip.duration / 60);
            this._lastTripDuration = durMin;
            this.setStoreValue('lastTripDuration', durMin).catch(this.error);
          }
          let calculatedSpeed = 0;
          if (typeof lastTrip.avg_speed === 'number' && lastTrip.avg_speed > 0) {
            calculatedSpeed = lastTrip.avg_speed;
          } else if (typeof lastTrip.speed === 'number' && lastTrip.speed > 0) {
            calculatedSpeed = lastTrip.speed;
          } else if (lastTrip.distance && lastTrip.duration && lastTrip.duration > 0) {
            calculatedSpeed = (lastTrip.distance / lastTrip.duration) * 3.6;
          }

          if (calculatedSpeed >= 3) {
            this.log(`Updated last trip speed: ${calculatedSpeed.toFixed(1)} km/h`);
            this._lastTripSpeed = calculatedSpeed;
            this.setCapability('meter_speed', calculatedSpeed);
            this.setCapabilityValue('meter_speed', calculatedSpeed).catch(this.error);
            this.setStoreValue('lastTripSpeed', calculatedSpeed).catch(this.error);
          }
        }
      }

      // Fallback calculation for duration if still missing
      if (!this._lastTripDuration) {
        const tripKm = this.getCapabilityValue('meter_trip') || 0;
        const currentSpeed = this._lastTripSpeed || speedCap || 0;
        if (tripKm > 0 && currentSpeed > 0) {
          const calcDur = Math.round((tripKm / currentSpeed) * 60);
          if (calcDur > 0) {
            this._lastTripDuration = calcDur;
            this.setStoreValue('lastTripDuration', calcDur).catch(this.error);
          }
        }
      }

      if (speedCap > 0) {
        this._lastTripSpeed = speedCap;
        this.setCapability('meter_speed', speedCap);
        this.setCapabilityValue('meter_speed', speedCap).catch(this.error);
        this.setStoreValue('lastTripSpeed', speedCap).catch(this.error);
      } else if (bike && bike.total_distance > 0 && bike.total_duration > 0) {
        const overallAvgSpeed = Math.round((bike.total_distance / (bike.total_duration / 3600)) * 10) / 10;
        if (overallAvgSpeed > 0) {
          this._lastTripSpeed = overallAvgSpeed;
          this.setCapability('meter_speed', overallAvgSpeed);
          this.setCapabilityValue('meter_speed', overallAvgSpeed).catch(this.error);
          this.setStoreValue('lastTripSpeed', overallAvgSpeed).catch(this.error);
        }
      }
    } catch (e) {
      this.error('updateLastTripSpeed error:', e);
    }
  }



  distance(pos1, pos2) {
    const lat1 = pos1.latitude;
    const lon1 = pos1.longitude;
    const lat2 = pos2 ? pos2.latitude : this.getSettings().lat;
    const lon2 = pos2 ? pos2.longitude : this.getSettings().lon;
    const from = new GeoPoint(Number(lat1), Number(lon1));
    const to = new GeoPoint(Number(lat2), Number(lon2));
    return Math.round(from.distanceTo(to, true) * 100) / 100;
  }

}

module.exports = MyDevice;
