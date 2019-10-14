const Plugin = require('../../structs/plugin.js');
const DatabasePlugin = require('../db');

class RestartNotifyPlugin extends Plugin {
    load() {
        this.bot.restartNotify = new RestartNotify(this.bot);
    }
}

class RestartNotify {
    constructor(bot) {
        this.bot = bot;
        bot.client.on('ready', this.onReady.bind(this));
    }

    static get deps() {
        return [
            DatabasePlugin
        ];
    }

    async onReady() {
        const channelId = this.bot.db.get('lastRestartChannel');
        console.log(channelId);
        if (!channelId) return;

        this.bot.db.delete('lastRestartChannel');

        const channel = this.bot.client.channels.get(channelId);
        console.log(channel);
        if (!channel) return;

        channel.send('Restarted!');
    }
}

module.exports = RestartNotifyPlugin;