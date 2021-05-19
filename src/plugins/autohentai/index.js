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
            const post = await this.getRandom(channel.TAGS);

            if (post !== null) {
                let message;

                if (typeof post === 'string') {
                    message = post;
                } else {
                    const embed = {
                        title: post.tag,
                        url: `https://gelbooru.com/index.php?page=post&s=view&id=${post.id}&tags=${post.tag}`,
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

            await this.wait(channel.INTERVAL * 1000);
        }
    }

    async getRandom(tags) {
        const tag = tags[Math.floor(Math.random() * tags.length)];

        return await this.fetchRandom(tag);
    }

    async fetchRandom(tag) {
        const cached = this.searches.get(tag);

        if (cached && cached.length !== 0) {
            const randomPost = cached.pop();

            return randomPost;
        }

        const posts = await this.fetchPosts(tag);

        this.searches.set(tag, posts);

        if (posts.length === 0) {
            return null;
        }

        return posts.pop();
    }

    async fetchTag(tag) {
        const xml = await got(`https://gelbooru.com/index.php`, {
            searchParams: {
                page: 'dapi',
                s: 'post',
                q: 'index',
                tags: tag,
                limit: 1,
                ...this.credentials
            }
        }).text();
        const document = parse(xml);

        const posts = document.querySelector('posts');

        if (!posts) return {
            count: 0
        };

        return {
            count: Number(posts.attributes.count)
        };
    }

    getOffset(count) {
        const max = Math.min(count, 400);

        return Math.floor(Math.random() * max / 42) * 42;
    }

    async fetchPosts(tag) {
        const tagInfo = await this.tags.get(tag, () => this.fetchTag(tag));
        const offset = this.getOffset(tagInfo.count);

        const tags = tag.split(' ');

        tags.push('-rating:safe');

        const xml = await got(`https://gelbooru.com/index.php`, {
            searchParams: {
                page: 'dapi',
                s: 'post',
                q: 'index',
                tags: tags.join(' '),
                limit: 50,
                pid: offset,
                ...this.credentials
            }
        }).text();
        const document = parse(xml);

        const posts = document.querySelectorAll('post')
            .map(postTag => {
                const attrs = {};

                for (const match of postTag.rawAttrs.matchAll(/(\w+)="([^"]+)"/g)) {
                    attrs[match[1]] = match[2];
                }

                const tags = attrs.tags.split(' ').map(tag => tag.trim()).filter(Boolean);

                return {
                    tag: tag,
                    tags: tags,
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
