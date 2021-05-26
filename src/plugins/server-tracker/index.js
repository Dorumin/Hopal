const got = require('got');
const { parse } = require('node-html-parser');
const Plugin = require('../../structs/Plugin');
const FormatterPlugin = require('../fmt');

class ServerTrackerPlugin extends Plugin {
    static get deps() {
        return [
            FormatterPlugin,
        ];
    }

    load() {
        this.bot.tracker = new ServerTracker(this.bot);
    }
}

class ServerTracker {
    constructor(bot) {
        this.bot = bot;
        this.dev = bot.config.ENV === 'development';
        this.config = bot.config.SERVER_TRACKER || {};
        this.tracking = this.config.SERVERS || [];
        this.meta = this.config.META || {};

        // this.status = new Map();
        // this.stored = new Cache();
        this.trackerState = [];

        bot.client.on('ready', this.onReady.bind(this));
    }

    onReady() {
        this.startFetching();
    }

    wait(ms) {
        return new Promise(res => setTimeout(res, ms));
    }

    async startFetching() {
        if (this.dev) return;

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

            for (const [index, tracker] of this.tracking.entries()) {
                if (tracker.DISABLED) continue;

                const matches = tracker.MATCH;

                let found = false;
                let serverData;
                for (const server of servers) {
                    const matching = matches.every(s => server.name.includes(s));
                    const matchingCountry = !tracker.hasOwnProperty('COUNTRY') ||
                        tracker.COUNTRY === server.country;
                    const matchingPassword = !tracker.hasOwnProperty('PASSWORD') ||
                        tracker.PASSWORD === server.passworded;

                    if (matching && matchingCountry && matchingPassword) {
                        found = true;
                        serverData = server;
                        break;
                    }
                }

                if (found) {
                    const state = this.trackerState[index];

                    if (!state) {
                        this.onEvent({
                            event: 'UP',
                            server: serverData,
                            tracker,
                            index
                        });

                        this.trackerState[index] = {
                            server: serverData
                        };
                    } else {
                        this.onEvent({
                            event: 'UPDATE',
                            server: serverData,
                            tracker,
                            index
                        });
                    }
                } else {
                    const state = this.trackerState[index];

                    if (state) {
                        this.onEvent({
                            event: 'DOWN',
                            server: servers.get(serverData.id),
                            tracker,
                            index
                        });

                        this.trackerState[index] = undefined;
                    }
                }
            }
        } catch(e) {
            console.error(e);
            console.error(e.response.body);
        }
    }

    async fetchServerData(server) {
        const json = await got(`https://dstserverlist.appspot.com/ajax/status/${server.id}`, {
            searchParams: {
                [this.meta.CSRF_KEY]: this.meta.CSRF_VALUE
            },
            headers: {
                'Cookie': this.meta.COOKIE,
                'Referer': 'https://dstserverlist.appspot.com/',
                'x-requested-with': 'XMLHttpRequest'
            }
        }).json();
        const html = json.result;
        const document = parse(html);

        const serverTable = document.querySelector('#server tbody');
        const daysRow = serverTable.childNodes[2];
        const daysTableData = daysRow.childNodes[0];
        const daysMatch = daysTableData.text.match(/Day (\d+)/);
        const days = daysMatch ? daysMatch[1] : 'Unknown';

        const playersList = document.querySelector('#players .row');
        const playersRows = playersList.querySelectorAll('.col');
        const players = playersRows.map(row => {
            const anchor = row.childNodes[0];
            const characterTextNode = row.childNodes[1];

            const steamLink = anchor.getAttribute('href');
            const name = anchor.text;
            const character = characterTextNode === undefined
                ? null
                : characterTextNode.text.trim().replace(/^\(|\)$/g, '');

            return {
                steamLink,
                name,
                character
            };
        });


        return {
            days,
            players
        };
    }

    async onEvent(data) {
        const { event, server, tracker, index } = data;

        const serverData = await this.fetchServerData(server);

        server.days = serverData.days;
        server.players = serverData.players;
        // This isn't strictly necessary, but it doesn't hurt to avoid silly
        // stuff like a different player count than player list
        server.playerCount = serverData.players.length;

        console.log({
            event,
            server,
            serverData
        });

        console.log(serverData.players);

        if (event === 'UPDATE') {
            const state = this.trackerState[index];

            if (state.message) {
                this.trackerState[index] = {
                    server: {
                        ...state.server,
                        ...server
                    }
                };

                await state.message.edit({
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

            const state = this.trackerState[index];

            if (state) {
                state.message = message;
            }
        }
    }

    buildEventEmbed(event, server) {
        const tags = [
            `Day ${server.days}`,
            server.season,
            server.mode
        ];

        if (server.modded) {
            tags.push('Modded');
        }

        if (server.outdated) {
            tags.push('Outdated');
        }

        if (server.passworded) {
            tags.push('Password');
        }

        if (server.pvp) {
            tags.push('PvP');
        }

        if (server.official) {
            tags.push('Klei');
        }

        let description = `${server.playerCount}/${server.maxPlayers} players online`;

        if (server.players.length !== 0) {
            description += '\n';

            for (const player of server.players) {
                const { name, steamLink, character } = player;

                description += `\n${this.bot.fmt.link(name, steamLink)}`;

                if (character !== null) {
                    description += ` (${character})`;
                }
            }
        }

        return {
            title: `:flag_${server.countryCode}: ${this.formatName(server.name)}`,
            color: this.getColor(event),
            description,
            footer: {
                text: `${this.getStatusEmoji(event)} ` + tags.join(' | ')
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

    getStatusEmoji(event) {
        switch(event) {
            case 'UP':
                // return ':green_circle:';
                return '🟢';
            case 'DOWN':
                // return ':red_circle:';
                return '🔴';
            default:
                // return ':black_circle:';
                return '⚫';
        }
    }

    getStatus(event) {
        switch(event) {
            case 'UP':
                return ':white_check_mark: Online!';
            case 'DOWN':
                return ':x: Offline';
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

                const id = row.getAttribute('id');

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

                // Get player count, fpy is also used to check for password
                const fpy = row.querySelector('.fpy');
                const playersText = fpy.firstChild.text;
                const match = playersText.match(/(\d+)\/(\d+)/);
                const playerCount = Number(match[1]);
                const maxPlayers = Number(match[2]);

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
                    id,
                    country,
                    countryCode,
                    platform,
                    playerCount,
                    maxPlayers,
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
