const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./util/config.js');
const { Partials } = require('discord.js');

class Hopal {
    constructor()  {
        this.client = new Client({
            allowedMentions: {
                parse: ['users', 'roles'],
                repliedUser: false
            },
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMessageReactions,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.DirectMessageReactions,
                GatewayIntentBits.GuildPresences,
                GatewayIntentBits.MessageContent,
                ...(config.HOPAL.INTENTS || [])
            ],
            partials: [
                Partials.Channel,
                Partials.Reaction,
                Partials.Message
            ]
        });
        this.config = config.HOPAL;
        this.operators = this.config.OPERATORS;
        this._globalConfig = config;
        this._loggedIn = false;
        this._plugins = [];
        this.loadedPlugins = [];

        this.client.on('ready', this.wrapListener(this.onReady, this));
        this.client.on('error', this.wrapListener(this.onError, this));
    }

    loadPlugin(Plugin) {
        if (this._loggedIn) throw new Error('Plugins must be loaded before calling login()');
        if (this._plugins.includes(Plugin)) return;

        this._plugins.push(Plugin);

        if (Plugin.deps) {
            Plugin.deps.forEach(this.loadPlugin.bind(this));
        }

        const plugin = new Plugin(this);
        plugin.load();
        this.loadedPlugins.push(plugin);
    }

    loadPluginDir(dir) {
        const plugins = this.config.PLUGINS || {};
        const wl = plugins.WHITELIST;
        const bl = plugins.BLACKLIST;
        fs.readdirSync(dir).forEach(file => {
            const p = path.join(dir, file);
            if (wl instanceof Array && !wl.includes(file)) {
                return;
            }
            if (bl instanceof Array && bl.includes(file)) {
                return;
            }
            const Plugin = require(p);
            this.loadPlugin(Plugin);
        });
    }

    listenPartial(event, handler, context) {
        if (!context) throw new Error(`Must pass a context to the ${event} listener`);

        this.client.on(event, this.wrapListener(handler, context));
    }

    onlyDev(instance) {
        if (!this.dev) {
            return false;
        }

        if (instance instanceof Guild) {
            return this.config.DEV?.GUILD !== instance.id;
        }

        if (instance instanceof Message) {
            if (instance.guild) {
                return this.config.DEV?.GUILD !== instance.guild.id;
            } else {
                return !this.operators.includes(instance.author?.id);
            }
        }

        return false;
    }

    onReady() {
        console.info('ready');
    }

    onError(e) {
        console.log('error', e);
    }

    login(token) {
        if (this._loggedIn) throw new Error('Cannot call login() twice');

        this._loggedIn = true;
        this.client.login(token);
    }

    async reportError(message, error) {
        console.error(message, error);

        if (this.config.REPORTING) {
            let newMessage = message;
            if (error) {
                if (typeof error.stack === 'string') {
                    newMessage += `\`\`\`apache\n${error.stack.slice(0, 1000)}\`\`\``;
                } else {
                    newMessage += `\`\`\`json\n${JSON.stringify(error)}\`\`\``
                }
            }
            const channel = this.client.channels.cache.get(this.config.REPORTING.CHANNEL);
            if (channel) {
                try {
                    await channel.send(newMessage);
                } catch(e) {
                    // Discard error, instance might be destroyed
                }
            }
        }
    }

    unhandledRejection(reason) {
        return this.reportError('Unhanded rejection:', reason);
    }

    wrapListener(listener, context) {
        return function() {
            try {
                return listener.apply(context, arguments);
            } catch (error) {
                return this.bot.reportError('Listener error:', error);
            }
        }.bind(this);
    }

    async cleanup() {
        console.log('called cleanup');

        for (const plugin of this.loadedPlugins) {
            await plugin.cleanup();
        }

        this.client.destroy();

        process.exit();
    }
}

module.exports = Hopal;
