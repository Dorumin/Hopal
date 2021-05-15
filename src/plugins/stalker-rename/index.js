const Plugin = require('../../structs/Plugin.js');

class StalkerRenamePlugin extends Plugin {
    load() {
        this.bot.stalker = new StalkerRename(this.bot);
    }
}

class StalkerRename {
    constructor(bot) {
        this.bot = bot;
        this.config = bot.config.STALKER || {};

        // bot.client.on('message', this.onMessage.bind(this));
    }
}

module.exports = StalkerRenamePlugin;
