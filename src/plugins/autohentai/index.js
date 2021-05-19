const got = require('got');
const { parse } = require('node-html-parser');
const Plugin = require('../../structs/Plugin');
const Cache = require('../../structs/Cache');

class AutoHentaiPlugin extends Plugin {
    load() {
        this.bot.autohentai = new AutoHentai(this.bot);
    }
}

class AutoHentai {
    constructor(bot) {
        this.bot = bot;
        this.config = bot.config.AUTOHENTAI || {};
        this.channels = this.config.CHANNELS || {};
        this.credentials = this.config.API || {};

        this.searches = new Map();
        this.tags = new Cache();

        this.lastId = this.fetchLastId();

        this.bot.client.on('ready', this.start.bind(this));
    }

    wait(ms) {
        return new Promise(res => setTimeout(res, ms));
    }

    start() {
        for (const id in this.channels) {
            this.startPosting(id, this.channels[id]);
        }
    }

    getRating(rating) {
        switch (rating) {
            case 's':
                return 'Safe';
            case 'q':
                return 'Questionable';
            case 'e':
                return 'Explicit'
        }
    }

    async startPosting(id, channel) {
        while (true) {
            await this.wait(channel.INTERVAL * 1000);

            const post = await this.getRandom(channel);

            if (post !== null) {
                let message;

                if (typeof post === 'string') {
                    message = post;
                } else {
                    const embed = {
                        title: post.tag,
                        url: `https://gelbooru.com/index.php?page=post&s=view&id=${post.id}&tags=${post.tag}`,
                        // Enabled while testing
                        // description: post.searchTags.join(' '),
                        footer: {
                            text: `Score: ${post.score} | ${this.getRating(post.rating)}`
                        }
                    };

                    if (!post.isVideo) {
                        embed.image = {
                            url: post.url
                        };
                    };

                    message = {
                        embed
                    };
                }

                const channel = this.bot.client.channels.cache.get(id);

                if (channel) {
                    channel.send(message);
                }

                if (post.isVideo) {
                    channel.send(post.url);
                }
            }
        }
    }

    async getRandom(channel) {
        const tags = channel.TAGS;
        const tag = tags[Math.floor(Math.random() * tags.length)];

        return await this.fetchRandom(tag, channel);
    }

    async fetchRandom(tag, channel) {
        const cached = this.searches.get(tag);

        if (cached && cached.length !== 0) {
            const randomPost = cached.pop();

            return randomPost;
        }

        const posts = await this.fetchPosts(tag, channel);

        this.searches.set(tag, posts);

        if (posts.length === 0) {
            return null;
        }

        return posts.pop();
    }

    async fetchLastId() {
        const xml = await got(`https://gelbooru.com/index.php`, {
            searchParams: {
                page: 'dapi',
                s: 'post',
                q: 'index',
                tags: '1girl',
                limit: 1,
                ...this.credentials
            }
        }).text();
        const document = parse(xml);

        const post = document.querySelector('post');

        if (!post) {
            // Hardcoded
            return 6116785;
        }

        return Number(this.getAttrs(post).id);
    }

    // async fetchTag(tag) {
    //     const xml = await got(`https://gelbooru.com/index.php`, {
    //         searchParams: {
    //             page: 'dapi',
    //             s: 'post',
    //             q: 'index',
    //             tags: tag,
    //             limit: 1,
    //             ...this.credentials
    //         }
    //     }).text();
    //     const document = parse(xml);

    //     const posts = document.querySelector('posts');

    //     if (!posts) return {
    //         count: 0
    //     };

    //     return {
    //         count: Number(posts.attributes.count)
    //     };
    // }

    // getOffset(count) {
    //     const max = Math.min(count, 400);

    //     return Math.floor(Math.random() * max / 42) * 42;
    // }

    async getRandomStartId() {
        const lastId = await this.lastId;

        // Random number from 0 to `lastId`
        return Math.floor(Math.random() * lastId);
    }

    getAttrs(element) {
        const attrs = {};

        for (const match of element.rawAttrs.matchAll(/(\w+)="([^"]+)"/g)) {
            attrs[match[1]] = match[2];
        }

        return attrs;
    }

    async fetchPosts(tag, channel) {
        // `pid` offset is limited, instead we use id:< randomization
        // Otherwise we run into "too deep" too easily

        // const tagInfo = await this.tags.get(tag, () => this.fetchTag(tag));
        // const offset = this.getOffset(tagInfo.count);

        const startId = await this.getRandomStartId();

        const searchTags = tag.split(' ');

        searchTags.push(`id:<${startId}`);
        searchTags.push('-rating:safe');

        if (channel.BLACKLIST) {
            for (const tag of channel.BLACKLIST) {
                searchTags.push(`-${tag}`);
            }
        }

        // TODO: Avoid series by stepping over 10 in the results
        // Only save n-th indexed results
        // Maybe add +1 offset each time it happens
        // Or have a set of "sent" image ids per tag
        const xml = await got(`https://gelbooru.com/index.php`, {
            searchParams: {
                page: 'dapi',
                s: 'post',
                q: 'index',
                tags: searchTags.join(' '),
                limit: 100,
                // pid: offset,
                ...this.credentials
            }
        }).text();
        const document = parse(xml);

        const posts = document.querySelectorAll('post')
            .map(postTag => {
                const attrs = this.getAttrs(postTag);
                const tags = attrs.tags.split(' ')
                    .map(tag => tag.trim())
                    .filter(Boolean);

                return {
                    tag: tag,
                    tags: tags,
                    searchTags: searchTags,
                    id: attrs.id,
                    isVideo: tags.includes('webm'),
                    url: attrs.file_url,
                    rating: attrs.rating,
                    score: attrs.score
                };
            });

        if (posts.length === 0) {
            return [
                `Error: ${xml} | Offset: ${offset} | Tag: ${tag}`
            ];
        }

        return posts;
    }
}

module.exports = AutoHentaiPlugin;
