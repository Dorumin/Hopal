const Plugin = require('../../structs/Plugin');
const express = require('express');

class HerokuPlugin extends Plugin {
    load() {
        this.bot.heroku = new Heroku(this.bot);
    }
}

class Heroku {
    constructor(bot) {
        this.bot = bot;
        this.config = bot.config.HEROKU || {};

        this.app = express();

        this.app.get('/', this.routeIndex);

        this.app.listen(process.env.PORT || this.config.PORT || 3000);

        this.alwaysOnline();
    }

    routeIndex(_, res) {
        res.end('Hopal for Opal');
    }

    alwaysOnline() {

    }
}

module.exports = HerokuPlugin;
