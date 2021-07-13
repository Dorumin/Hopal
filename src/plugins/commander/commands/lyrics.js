const got = require('got');
const cheerio = require('cheerio');
const Command = require('../structs/Command.js');
const FormatterPlugin = require('../../fmt');

class LyricsCommand extends Command {
    static get deps() {
        return [
            FormatterPlugin
        ];
    }

    constructor(bot) {
        super(bot);
        this.aliases = ['lyrics', 'l'];

        this.shortdesc = `Sends you the lyrics of a song`;
        this.desc = `Sends an embed for the lyrics of a song`;
        this.usages = [
            '!l',
            `!l don't worry you will`
        ];
    }

    async call(message, content) {
        let target = message.mentions.members && message.mentions.members.first();
        let isUser = false;

        if (!target) {
            const id = content.match(/\d{8,}/);

            if (id) {
                target = this.bot.client.users.cache.get(id[0]);
                isUser = true;
            }
        }

        if (!target) {
            target = message.author;
            isUser = true;
        }

        let search = content.replace(/<@!?\d+>/, '');

        if (!search) {
            const presence = isUser ? target.presence.activities : target.user.presence.activities
            const spotify = presence.find(activity =>
                activity.name === 'Spotify' &&
                activity.type === 'LISTENING'
            );

            if (spotify) {
                const {
                    details: title,
                    state: artist
                } = spotify;

                search = `${title} ${artist}`;
            } else {
                message.channel.send('Supply a search query.');
                return;
            }
        }

        const songs = await this.searchGenius(search);

        if (songs.length === 0) {
            message.channel.send('No matching songs found.');
            return;
        }

        const song = songs[0];

        const data = await this.fetchSongData(song);
        const chunked = this.chunkLyrics(data.lyrics);

        const title = this.bot.fmt.bold(data.title);
        const artist = this.bot.fmt.bold(data.artist);

        for (let i = 0; i < chunked.length; i++) {
            const first = i === 0;
            const last = i === chunked.length - 1;

            await message.channel.send({
                embed: {
                    url: data.url,
                    title: this.only(first,
                        `Song lyrics for ${title} by ${artist}!`),
                    thumbnail: this.only(first, {
                        url: data.thumb
                    }),
                    description: chunked[i].join('\n'),
                    footer: this.only(last, {
                        text: `Just for you, ${this.nameOf(target, isUser)}`,
                        icon_url: this.avatarOf(target, isUser)
                    })
                }
            });
        }
    }

    nameOf(member, isUser) {
        if (isUser) {
            return member.username;
        }
        
        return member.nickname || member.user.username;
    }

    avatarOf(target, isUser) {
        const user = isUser ? target : target.user;

        return user.avatarURL({
            format: 'png',
            dynamic: true,
            size: 32
        });
    }
    
    only(cond, value) {
        if (cond) {
            return value;
        } else {
            return undefined;
        }
    }

    async fetchSongData(song) {
        const lyrics = await this.fetchSongLyrics(song);
        const url = `https://genius.com${song.result.path}`;
        const title = song.result.title;
        const artist = song.result.primary_artist.name;
        const thumb = song.result.song_art_image_thumbnail_url;

        return {
            url,
            title,
            artist,
            thumb,
            lyrics
        };
    }

    async fetchSongLyrics(song) {
        const html = await got(`https://genius.com${song.result.path}`).text();
        const extracted = this.extractSongLyrics(html);

        return this.formatLyrics(extracted);
    }

    extractSongLyrics(html) {
        const $ = cheerio.load(html);

        const $simple = $('.lyrics p');

        if ($simple.length !== 0) {
            return $simple.text();
        }

        // Genius has decided to make it hard on us
        // global.$ = $;

        const $fucky = $('[class^="Lyrics__Container"]');

        let cumulative = '';

        function traverse(tree) {
            for (const node of tree.childNodes) {
                if (node.type === 'tag') {
                    traverse(node);
                } else if (node.type === 'text') {
                    cumulative += $(node).text();
                }
            }
        }

        $fucky.each((_, elem) => {
            $(elem).find('br').replaceWith('\n');

            traverse(elem);
        });

        return cumulative;
    }

    async searchGenius(query) {
        const json = await got(`https://genius.com/api/search/song`, {
            searchParams: {
                page: 1,
                q: query
            }
        }).json();

        const lowerQuery = query.toLowerCase();

        const songs = json.response.sections[0].hits.sort((a, b) => {
            const same1 = a.result.title.toLowerCase() == lowerQuery;
            const same2 = b.result.title.toLowerCase() == lowerQuery;

            if (same1 === same2) {
                // Both match, return most viewed
                return b.result.stats.pageviews - a.result.stats.pageviews;
            }

            if (same1) return -1;
            if (same2) return 1;

            return 0;
        });

        return songs;
    }

    chunkLyrics(lyrics) {
        return this.chunkTextBlocks(lyrics.split('\n'), 1, 2048);
    }

    // Function used to join blocks of text
    // arr  - Array of the blocks of text, usually lines
    // jump - the overhead for each block of text returned together
    // max  - the max length of each text, accounting for all previous jumps
    //        but not the next
    chunkTextBlocks(arr, jump, max) {
        const chunks = [];
        let len = 0;
        let current = 0;

        chunks[current] = [];
        for (let i = 0; i < arr.length; i++) {
            const item = arr[i];
            if (len + item.length > max) {
                len = 0;
                current++;
                chunks[current] = [];
            }

            len += item.length + jump;
            chunks[current].push(item);
        }

        return chunks;
    }

    // Cleans up lyrics, removing block types like verse/bridge/chorus,
    // and then removes any triple+ newlines left over
    formatLyrics(lyrics) {
        const split = lyrics.split('\n')
            .map(line => line.trim())
            .filter(line => !line.startsWith('['));

        return split.join('\n')
            .replace(/\n{2,}/g, '\n\n')
            .replace(/\*/g, '\\*')
            .trim();
    }
}

module.exports = LyricsCommand;
