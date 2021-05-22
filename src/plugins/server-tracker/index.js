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

            await this.updateMeta();

            await this.doFetch();

            await this.wait(this.meta.INTERVAL * 1000);
        }
    }

    async updateMeta() {
        const response = await got(`https://dstserverlist.appspot.com/`);

        const cookies = response.headers['set-cookie']
            .map(cookie => cookie.split(';')[0].split('='));
        const sessionCookie = cookies
            .find(([name]) => name === 'SESSION_ID');;

        const html = response.body;
        const document = parse(html);

        const csrfName = document.querySelector('[name="csrf_name"]').attributes.content;
        const csrfValue = document.querySelector('[name="csrf_value"]').attributes.content;

        // console.log(sessionCookie, csrfName, csrfValue);

        this.meta.COOKIE = `${sessionCookie[0]}=${sessionCookie[1]}`;
        this.meta.CSRF_KEY = csrfName;
        this.meta.CSRF_VALUE = csrfValue;
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
                    } else {
                        this.onEvent({
                            event: 'UPDATE',
                            server: serverData,
                            tracker
                        });
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

    async onEvent(data) {
        const { event, server, tracker } = data;

        console.log({
            event,
            server
        });

        if (event === 'UPDATE') {
            const stored = this.status.get(tracker.CHANNEL);

            if (stored.message) {
                this.status.set(tracker.CHANNEL, {
                    ...stored,
                    ...server
                });

                await stored.message.edit({
                    embed: this.buildEventEmbed('UP', server)
                });
            }

            return;
        }

        const channel = this.bot.client.channels.cache.get(tracker.CHANNEL);

        if (channel) {
            const message = await channel.send({
                embed: this.buildEventEmbed(event, server)
            });

            const stored = this.status.get(tracker.CHANNEL);

            if (stored) {
                stored.message = message;
            }
        }
    }

    buildEventEmbed(event, server) {
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

        if (server.pvp) {
            tags.push('PvP');
        }

        if (server.official) {
            tags.push('Klei');
        }

        return {
            title: `:flag_${server.countryCode}: ${this.formatName(server.name)}`,
            color: this.getColor(event),
            description: this.getStatus(event) + `\n` +
                `${server.players} players online`,
            footer: {
                text: tags.join(' | ')
            }
        };
    }

    formatName(name) {
        return name
            .replace(/󰀅/g, ':eyeball:')
            .replace(/󰀯/g, ':wormhole:')
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
        const servers = document.querySelectorAll('.list > tr')
            .map(row => {
                const firstData = row.querySelector('td');

                // Get name, no error checking
                const name = firstData.querySelector('.fnm').text;

                // Get country name and code
                const flag = firstData.querySelector('.flag-icon');
                const country = flag.getAttribute('data-tooltip');
                const countryCode = flag.getAttribute('class').split(' ')
                    .pop()
                    .split('-')
                    .pop();

                // Get platform: Steam, WeGame, PS4, more?
                const platform = row.querySelector('.fpf').text;

                // Get player count, fpy is also used to check for password1
                const fpy = row.querySelector('.fpy');
                const players = fpy.firstChild.text;

                // Get gamemode (normal/endless) and current season
                const mode = row.querySelector('.fmd').text;
                const season = row.querySelector('.fss').text;

                // Get some flags: modded, outdated, pvp, official, passworded
                const icons = firstData.querySelectorAll('.mico');
                const modded = icons.some(icon => icon.text === 'settings');
                const outdated = icons.some(icon => icon.text === 'warning');
                const pvp = icons.some(icon => icon.text === 'restaurant_menu');
                const official = icons.some(icon => icon.text === 'check_circle');

                // Player count can have a lock icon if it's passworded
                const passworded = fpy.querySelector('.mico') !== null;

                return {
                    country,
                    countryCode,
                    platform,
                    players,
                    name,
                    mode,
                    season,
                    modded,
                    outdated,
                    pvp,
                    official,
                    passworded
                };
            });
        console.timeEnd('deserializing');

        return servers;
    }
}

module.exports = ServerTrackerPlugin;
