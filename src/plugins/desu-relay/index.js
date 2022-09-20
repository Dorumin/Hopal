const Plugin = require('../../structs/Plugin');

const got = require('got');
const { parse } = require('node-html-parser');
const { MessageEmbed } = require('discord.js');

class DesuRelayPlugin extends Plugin {
    load() {
        this.bot.desuRelay = new DesuRelay(this.bot);
    }
}

class DesuRelay {
    constructor(bot) {
        this.bot = bot;
        this.config = bot.config.DESU_RELAY || {};
        this.relays = this.config.RELAYS.map(relay => new Relay(relay, this));

        bot.client.on('ready', this.setup.bind(this));
    }

    setup() {
        setInterval(() => {
            this.task();
        }, 1000 * 60 * 5);

        this.task();
    }

    async task() {
        console.log('fetching desu relay');

        for (const relay of this.relays) {
            try {
                await relay.search();
            } catch(e) {
                console.log('error in relay:', e);
            }
        }
    }
}


class Relay {
    constructor(relay, desu) {
        this.bot = desu.bot;
        this.channelId = relay.CHANNEL_ID;
        this.searchQuery = relay.SEARCH;

        this.lastThread = null;
        this.lastPost = null;

        this.bot.client.on('ready', () => {
            this.pastLinks = this.queryPastLinks();
        });
    }

    async queryPastLinks() {
        const channel = await this.bot.client.channels.fetch(this.channelId);

        const pastLinks = [];
        let lastId = '0';
        while (true) {
            const messageBatch = await channel.messages.fetch({
                limit: 100,
                after: lastId,
                cache: false
            });

            if (messageBatch.size === 0) break;

            lastId = messageBatch.first().id; // first ID is the largest

            for (const message of messageBatch.values()) {
                if (message.embeds.length > 0) {
                    const embed = message.embeds[0];

                    if (embed.image) {
                        pastLinks.push(embed.image.url);
                    }
                }
            }

            console.log(`added `, messageBatch.size);
        }

        return pastLinks;
    }

    async search() {
        const res = await got(`https://desuarchive.org/trash/search${this.getSearchString()}`);
        const doc = parse(res.body);
        const postResults = doc.querySelectorAll('.post_is_op').filter(post => {
            const title = post.querySelector('.post_title')?.textContent;

            if (this.searchQuery.subject) {
                if (!title.includes(this.searchQuery.subject)) return false;
            }

            return true;
        });
        const firstPost = postResults[0];

        if (!firstPost) return;

        const id = firstPost.getAttribute('id');

        if (id !== this.lastThread) {
            this.lastPost = null;
            this.lastThread = id;
        }

        const threadRes = await got(`https://desuarchive.org/trash/thread/${id}`);
        const threadDoc = parse(threadRes.body);
        const posts = threadDoc.querySelectorAll('.post[id]');
        if (posts.length === 0) return;

        const lastPost = posts[posts.length - 1];
        const lastPostId = lastPost.getAttribute('id');

        if (this.lastPost === null) {
            this.lastPost = '0';
            // Normally, we would start on the last post
            // However, due to deduplication, we can afford to start from the first
            // this.lastPost = lastPostId;
        }

        const nextPosts = posts.filter(post => post.getAttribute('id') > this.lastPost);

        if (lastPostId !== this.lastPost) {
            this.lastPost = lastPostId;
        }

        console.log('next:', nextPosts.length);

        for (const post of nextPosts) {
            const postData = this.extractPostData(post);
            this.sendPost(postData);
        }
    }

    extractPostData(post) {
        // replace all brs with line breaks
        for (const br of post.querySelectorAll('.text br')) {
            br.replaceWith('\n');
        }

        const id = post.getAttribute('id');
        const author = post.querySelector('.post_author')?.textContent;
        const url = post.querySelector('a[data-function="highlight"]')?.getAttribute('href');
        const image = post.querySelector('.thread_image_box a')?.getAttribute('href');
        const text = post.querySelector('.text')?.textContent
            ?.replace(/>>(\d+)/g, (text, id) => {
                return `[${text}](${url?.replace(/#\d+/, '#' + id)})`;
            });
        const datetime = post.querySelector('time')?.getAttribute('datetime');
        const timestamp = datetime ? new Date(datetime) : null;
        const filename = post.querySelector('.post_file_filename')?.getAttribute('title');
        const fileMeta = post.querySelector('.post_file_metadata')?.textContent;

        return {
            id,
            author,
            url,
            text,
            image,
            timestamp,
            filename,
            fileMeta
        };
    }

    async sendPost(postData) {
        if (!postData.image) return;

        const pastLinks = await this.pastLinks;

        if (pastLinks.includes(postData.image)) {
            console.log('Ignoring duplicate', postData.image);

            return;
        }

        const channel = await this.bot.client.channels.fetch(this.channelId);

        pastLinks.push(postData.image);

        console.log('sending', postData.image);

        return;

        await channel.send({
            embeds: [
                new MessageEmbed()
                    .setTitle(postData.filename)
                    .setURL(postData.url)
                    // .setTitle(postData.author)
                    // .setURL(postData.url)
                    // .setDescription(postData.text)
                    .setImage(postData.image)
                    // .setFooter({
                    //     text: postData.id
                    // })
                    // .setTimestamp(postData.timestamp)
            ]
        });
    }

    getSearchString() {
        let s = '';

        for (const key in this.searchQuery) {
            const value = this.searchQuery[key];

            s += `/${key}/${encodeURIComponent(value)}`;
        }

        return s;
    }
}

module.exports = DesuRelayPlugin;
