#!/usr/bin/env node
const path = require('path');
const Hopal = require('./src/Hopal.js');
const client = new Hopal();

client.loadPluginDir(path.join(__dirname, 'src', 'plugins'));

if (client.commander) {
    client.commander.loadCommandDir(path.join(__dirname, 'src', 'plugins', 'commander', 'commands'));
}

client.login(client.config.TOKEN);
