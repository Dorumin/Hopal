const got = require('got');
const { parse } = require('node-html-parser');
const Plugin = require('../../structs/Plugin.js');

class ServerTrackerPlugin extends Plugin {
    load() {
        this.bot.tracker = new ServerTracker(this.bot);
    }
}

class ServerTracker {
    constructor(bot) {
        this.bot = bot;
        this.config = bot.config.SERVER_TRACKER || {};
        this.tracking = this.config.SERVERS || [];
        this.meta = this.config.META || {};

        this.status = new Map();

        bot.client.on('ready', this.onReady.bind(this));
    }

    onReady() {
        this.startFetching();
    }

    wait(ms) {
        return new Promise(res => setTimeout(res, ms));
    }

    async startFetching() {
        while (true) {
            // await this.wait(this.meta.INTERVAL * 1000);

            await this.doFetch();

            await this.wait(this.meta.INTERVAL * 1000);
        }
    }

    async doFetch() {
        try {
            const servers = await this.fetch();

            for (const tracker of this.tracking) {
                const matches = tracker.MATCH;
                const id = tracker.CHANNEL;

                let found = false;
                let serverData;
                for (const server of servers) {
                    const matching = matches.every(s => server.name.includes(s));
                    const matchingCountry = !tracker.hasOwnProperty('COUNTRY') ||
                        tracker.COUNTRY == server.country;

                    if (matching && matchingCountry) {
                        console.log(server.name);

                        found = true;
                        serverData = server;
                        break;
                    }
                }

                if (found) {
                    if (!this.status.has(id)) {
                        this.onEvent({
                            event: 'UP',
                            server: serverData,
                            tracker
                        });

                        this.status.set(id, serverData);
                    }
                } else {
                    if (this.status.has(id)) {
                        this.onEvent({
                            event: 'DOWN',
                            server: this.status.get(id),
                            tracker
                        });

                        this.status.delete(id);
                    }
                }
            }
        } catch(e) {
            console.error(e);
            console.error(e.response.body);
        }
    }

    onEvent({ event, server, tracker }) {
        console.log({
            event,
            server,
            tracker
        });

        const channel = this.bot.client.channels.cache.get(tracker.CHANNEL);

        const tags = [
            server.season,
            server.mode
        ];

        if (server.modded) {
            tags.push('Modded');
        }

        if (server.outdated) {
            tags.push('Outdated');
        }

        if (channel) {
            channel.send({
                embed: {
                    title: `:flag_${server.countryCode}: ${this.formatName(server.name)}`,
                    color: this.getColor(event),
                    description: this.getStatus(event) + `\n` +
                        `${server.players} players online`,
                    footer: {
                        text: tags.join(' | ')
                    }
                }
            });
        }
    }

    formatName(name) {
        return name
            .replace(/󰀈/g, ':fire:')
            .replace(/󰀉/g, ':ghost:')
            .replace(/󰀍/g, ':heart:')
            .replace(/󰀁/g, ':beefalo:');
    }

    getStatus(event) {
        switch(event) {
            case 'UP':
                return ':white_check_mark: Now online!';
            case 'DOWN':
                return ':x: Now offline';
            default:
                return 'Ehhhh?';
        }
    }

    getColor(event) {
        switch(event) {
            case 'UP':
                return 0x00FF00;
            case 'DOWN':
                return 0xFF0000;
            default:
                return 0x00FFFF;
        }
    }

    async fetch() {
        console.time('fetching');
        const ts = Math.floor(Date.now() / 1000);
        const res = await got(`https://dstserverlist.appspot.com/ajax/list?${ts}`, {
            searchParams: {
                [this.meta.CSRF_KEY]: this.meta.CSRF_VALUE
            },
            headers: {
                'Cookie': this.meta.COOKIE,
                'Referer': 'https://dstserverlist.appspot.com/',
                'x-requested-with': 'XMLHttpRequest'
            }
        }).json();
        console.timeEnd('fetching');
        console.time('parsing');
        const document = parse(res.result);
        console.timeEnd('parsing');

        console.time('deserializing');
        const servers = document.querySelectorAll('.list tr')
            .map(row => {
                const flag = row.querySelector('.flag-icon');
                const country = flag && flag.attributes['data-tooltip'];
                const countryCode = flag && flag.attributes['class'].split(' ')
                    .pop()
                    .split('-')
                    .pop();

                const fnm = row.querySelector('.fnm');
                if (!fnm) {
                    return null;
                }

                const name = fnm.text;
                if (!name) {
                    return null;
                }

                const fpy = row.querySelector('.fpy');
                const players = fpy && fpy.firstChild && fpy.firstChild.text;

                const mode = row.querySelector('.fmd').text;
                const season = row.querySelector('.fss').text;

                const icons = row.querySelectorAll('.mico');
                const icon = icons[icons.length - 1];
                const modded = icon && icon.text === 'settings';
                const outdated = icon && icon.text === 'warning';

                return {
                    country,
                    countryCode,
                    players,
                    name,
                    mode,
                    season,
                    modded,
                    outdated
                };
            })
            .filter(server => server !== null);
        console.timeEnd('deserializing');

        // console.log(document.querySelectorAll('.list tr').length);
        // console.log(servers.length);
        // console.log(servers[0]);

        return servers;
    }
}

module.exports = ServerTrackerPlugin;
