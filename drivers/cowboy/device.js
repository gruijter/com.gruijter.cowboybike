/* eslint-disable no-await-in-loop */
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

const { Device } = require('homey');
const GeoPoint = require('geopoint');
const util = require('util');
const Cowboy = require('../../cowboybike');

const setTimeoutPromise = util.promisify(setTimeout);

class MyDevice extends Device {

  async onInit() {
    try {
      await this.migrate();
      this.setAvailable().catch(this.error);
      this.setCapability('alarm_relocated', false);
      this.restarting = false;
      this.lastBikeData = this.getStoreValue('lastBikeData');
      const settings = this.getSettings();
      const options = {
        email: settings.email,
        password: settings.password,
      };
      this.cowboy = new Cowboy(options);
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
      // store the capability states before migration
      const sym = Object.getOwnPropertySymbols(this).find((s) => String(s) === 'Symbol(state)');
      const state = this[sym];
      // check and repair incorrect capability(order)
      const correctCaps = this.driver.ds.capabilities;
      for (let index = 0; index <= correctCaps.length; index += 1) {
        const caps = await this.getCapabilities();
        const newCap = correctCaps[index];
        if (caps[index] !== newCap) {
          this.setUnavailable('Migrating. Please wait!').catch(() => null);
          // remove all caps from here
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
            if (state[newCap]) this.log(`${this.getName()} restoring value ${newCap} to ${state[newCap]}`);
            // else this.log(`${this.getName()} has gotten a new capability ${newCap}!`);
            if (state[newCap] !== undefined) this.setCapability(newCap, state[newCap]);
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
    const { bike } = this.cowboy.data;
    const settings = {
      model: bike.model.name,
      sku: bike.sku_code,
      serial: bike.serial_number,
      mac: bike.mac_address,
      actDate: bike.activated_at,
      firmware: bike.firmware_version,
      maxSpeed: bike.settings.max_speed.toString(),
    };
    if (bike.sku && bike.sku.features) settings.maxRange = bike.sku.features.battery_autonomy.toString();
    const storedSettings = this.getSettings();
    Object.keys(settings).forEach((key) => {
      if (settings[key] !== storedSettings[key]) {
        this.log(`${this.getName()} changed ${key} from ${settings[key]} to ${storedSettings[key]}`);
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
      this.setCapability('meter_odo', bike.total_distance);
      this.setCapability('meter_duration', bike.total_duration / 3600);
      this.setCapability('latitude', bike.position.latitude);
      this.setCapability('longitude', bike.position.longitude);
      this.setCapability('location', bike.position.address);

      // update calculated capabilities
      this.setCapability('meter_range', bike.autonomy * (bike.battery_state_of_charge / 100));
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
        if (deltaT > 0) {
          const speed = 3600 * (deltaD / deltaT);
          this.setCapability('meter_speed', speed);
          // console.log(bike, deltaT, deltaD, speed);
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
      await this.checkSettings();
    } catch (error) {
      this.error(error);
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
