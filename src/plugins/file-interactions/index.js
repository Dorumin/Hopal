const child_process = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { Interaction, ApplicationCommandType, ContextMenuCommandBuilder, MessageFlags, EmbedBuilder, MessageContextMenuCommandInteraction, AttachmentBuilder } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const Plugin = require('../../structs/Plugin');
const FormatterPlugin = require('../fmt');

class FileInteractionsPlugin extends Plugin {
    static get deps() {
        return [
            FormatterPlugin
        ];
    }

    load() {
        this.bot.fileInteractions = new FileInteractions(this.bot);
    }
}

class FileInteractions {
    constructor(bot) {
        this.bot = bot;
        this.config = bot.config.FILE_INTERACTIONS || {};
        this.guildIds = this.config.GUILD_IDS || [];

        bot.client.on('ready', this.setupCommands.bind(this));
        bot.client.on('interactionCreate', this.onInteraction.bind(this));
    }

    async setupCommands() {
        const rest = new REST({ version: '10' }).setToken(this.bot.client.token);
        const commands = [
            new ContextMenuCommandBuilder()
                .setName('Reupload')
                .setType(ApplicationCommandType.Message)
                .toJSON(),
            new ContextMenuCommandBuilder()
                .setName('Reverse image search')
                .setType(ApplicationCommandType.Message)
                .toJSON()
        ];


        for (const guildId of this.guildIds) {
            console.log(guildId, Routes.applicationGuildCommands(this.bot.client.application.id, guildId));
            await rest.put(Routes.applicationGuildCommands(this.bot.client.application.id, guildId), {
                body: commands
            });
        }
    }

    /**
     *
     * @param {Interaction} interaction
     * @returns
     */
    async onInteraction(interaction) {
        if (interaction.isMessageContextMenuCommand() && interaction.commandName === 'Reupload') {
            await this.onReupload(interaction);
        }

        if (interaction.isMessageContextMenuCommand() && interaction.commandName === 'Reverse image search') {
            await this.onReverseImageSearch(interaction);
        }
    }

    /**
     *
     * @param {MessageContextMenuCommandInteraction} interaction
     */
    async onReupload(interaction) {
        const source = this.extractSource(interaction);

        if (!source) {
            await interaction.reply({
                content: `I don't know what to do with this (only supports twitter)`,
                flags: MessageFlags.Ephemeral
            });

            return;
        }

        if (source.ty === 'image') {
            await interaction.reply({
                content: `The image is at ${source.image}, but I won't reupload it because the tweet might have multiple files`,
                flags: MessageFlags.Ephemeral
            });
        } else {
            try {
                // Can't make a follow-up conditionally ephemeral (for the error case). Sad
                await interaction.deferReply();

                const filePaths = await this.download(source);

                await interaction.followUp({
                    content: `<${source.url}>`,
                    files: filePaths.map(filePath => new AttachmentBuilder(filePath))
                });

                try {
                    await fs.rm(filePath);
                } catch(e) {}
            } catch(e) {
                console.error('download error', e);
                await interaction.followUp({
                    content: `Something fucked up while downloading (and I'm not telling you what)`,
                });
            }
        }
    }

    extractSource(interaction) {
        if (interaction.targetMessage.embeds.length > 0) {
            const embed = interaction.targetMessage.embeds[0];

            if (embed.url) {
                if (/youtu\.be|youtube\.com/.test(embed.url)) {
                    source = {
                        ty: 'video',
                        url: embed.url,
                        image: null,
                        fallbacks: []
                    };
                }

                if ((embed.url.includes('://x.com') || embed.url.includes('://twitter.com') || embed.url.includes('://xcancel.com')) && embed.image) {
                    let ty = 'image';
                    if (embed.image && embed.image.url.includes('tweet_video_thumb')) {
                        ty = 'gif';
                    } else if (embed.image && embed.image.url.includes('amplify_video_thumb')) {
                        ty = 'video';
                    }

                    return {
                        ty,
                        url: embed.url.replace(/:\/\/(twitter|xcancel).com/, '://x.com'),
                        image: embed.image?.url,
                        fallbacks: []
                    };
                }

                if (embed.url.includes('://vxtwitter.com') || embed.url.includes('://fxtwitter.com')) {
                    let ty = 'image';
                    let fallbacks = [];
                    if (embed.footer?.text.includes('GIF')) {
                        ty = 'gif';
                        if (embed.video && embed.video.url) {
                            fallbacks.push(embed.video.url);
                        }
                    } else if (embed.video && embed.video.url) {
                        ty = 'video';
                        fallbacks.push(embed.video.url);
                    }

                    return {
                        ty,
                        url: embed.url.replace(/[fv]xtwitter\.com/, 'x.com'),
                        image: embed.image?.url,
                        fallbacks
                    };
                }

                if (embed.url.includes('://fixupx.com')) {
                    let ty = 'image';
                    const fallbacks = [];
                    if (embed.image && embed.image.url.includes('.gif')) {
                        ty = 'gif';
                        fallbacks.push(embed.image.url);
                    } else if (embed.video && embed.video.url) {
                        ty = 'video';
                        fallbacks.push(embed.video.url);
                    }

                    return {
                        ty,
                        url: embed.url.replace('fixupx.com', 'x.com'),
                        image: embed.image?.url,
                        fallbacks
                    };
                }

                if (embed.url.includes('://tiktok.com') || embed.url.includes('://www.tiktok.com')) {
                    return {
                        ty: 'video',
                        url: embed.url,
                        image: null,
                        fallbacks: []
                    };
                }
            }
        }
    }

    async download(source) {
        console.log('download', source);

        let filePaths;
        try {
            filePaths = await this.ytdl(source.url);
        } catch(e) {
            for (const fallback of source.fallbacks) {
                try {
                    console.log(`Trying fallback: ${fallback}`);
                    filePaths = await this.ytdl(fallback);
                    break;
                } catch(e) {}
            }

            if (!filePaths) {
                // No fallback succeeded
                throw e;
            }
        }

        console.log('downloaded files', filePaths);

        if (source.ty === 'gif') {
            // TODO: Make a decent abstraction to try multiple steps in a row
            // For palettegen, then without if oom, then just upload video
            const gifPaths = await this.allShortCircuiting(filePaths, this.convertGifGlobalPalette.bind(this));

            if (gifPaths) {
                return gifPaths;
            }

            const shittyPaths = await this.allShortCircuiting(filePaths, this.convertGifShitty.bind(this));

            if (shittyPaths) {
                return shittyPaths;
            }
        }

        return filePaths;
    }

    async ytdl(url) {
        const ytdl = await this.spawn('yt-dlp', [
            // '-j',
            '--print', 'after_move:filename',
            // Works around dumb file names with utf-8 which fail to pipe
            '-o', '%(id)s.%(ext)s',
            url
        ]);
        const filePaths = ytdl.stdout.trim().split('\n').map(line => line.trim());

        return filePaths;
    }

    async allShortCircuiting(filePaths, mapper) {
        const results = [];

        for (const filePath of filePaths) {
            const result = await mapper(filePath);

            if (result === null) return null;

            results.push(result);
        }

        return results;
    }

    async convertGifGlobalPalette(filePath) {
        const gifPath = path.join(path.dirname(filePath), `${path.basename(filePath)}.gif`);
        const palettePath = path.join(path.dirname(filePath), `${path.basename(filePath)}.palette.png`);
        let _gifPath;
        let _palettePath;

        try {
            await this.spawn('ffmpeg', [
                '-i', filePath,
                '-vf', 'palettegen',
                palettePath
            ]);
            _palettePath = palettePath;

            await this.spawn('ffmpeg', [
                '-i', filePath,
                '-i', palettePath,
                // I hope separately computing the palette doesn't hammer the memory
                // Disable paletteuse's dithering, which is sierra2_4a by default,
                // because 'none' is presumably much easier to compute and because it looks better for gif content
                // (mostly animation).
                // sierra2_4a and bayer are the best for content that really suffers from banding, the others
                // can show some more obvious banding but don't suffer from the former's butchering of animation
                // https://ffmpeg.org/ffmpeg-filters.html#paletteuse
                //
                // Note: I haven't tested speed or memory usage of any of these, I'm just assuming none is best
                '-filter_complex', '[0:v][1:v]paletteuse=dither=none',
                // Easier on the memory usage and cpu contention
                '-threads', '1',
                // Loop infinitely
                '-loop', '0',
                // Just in case
                '-y',
                gifPath
            ]);
            _gifPath = gifPath;

            await fs.rm(filePath);

            return gifPath;
        } catch(e) {
            console.log('failure when fancy encoding gif - oom likely', e);

            await Promise.allSettled([
                // Awaiting undefined values is fine
                _palettePath && fs.rm(_palettePath),
                _gifPath && fs.rm(_gifPath),
            ]);

            return null;
        }
    }

    async convertGifShitty(filePath) {
        const gifPath = path.join(path.dirname(filePath), `${path.basename(filePath)}.gif`);
        let _gifPath;

        try {
            await this.spawn('ffmpeg', [
                '-i', filePath,
                // Palette gen works well but needs heaps of memory
                // '-vf', `fps=50,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
                // Easier on the memory usage and cpu contention
                '-threads', '1',
                // Loop infinitely
                '-loop', '0',
                // Just in case
                '-y',
                gifPath
            ]);
            _gifPath = gifPath;

            await fs.rm(filePath);

            return gifPath;
        } catch(e) {
            console.log('failure when shitty encoding gif - oom likely', e);

            await Promise.allSettled([
                // Awaiting undefined values is fine
                _gifPath && fs.rm(_gifPath),
            ]);

            return null;
        }
    }

    spawn(exe, args, spawnOptions = {}) {
        return new Promise((resolve, reject) => {
            const process = child_process.spawn(exe, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true,
                ...spawnOptions
            });

            // This doesn't seem to do much - I'll just ensure filenames...
            process.stdout.setEncoding('utf8');
            process.stderr.setEncoding('utf8');

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('error', (err) => {
                reject({ code: 1, stdout, stderr, err });
            });

            process.on('close', (code) => {
                if (code !== 0) {
                    reject({ code, stdout, stderr });
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
    }

    /**
     *
     * @param {MessageContextMenuCommandInteraction} interaction
     */
    async onReverseImageSearch(interaction) {
        let url;

        for (const attachment of interaction.targetMessage.attachments.values()) {
            if (url) break;
            // check for image types later
            url = attachment.url;
        }

        for (const embed of interaction.targetMessage.embeds.values()) {
            if (url) break;

            if (embed.image) {
                url = embed.image.url
            }
        }

        if (!url) {
            await interaction.reply({
                content: 'I could find no image to search for.',
                flags: MessageFlags.Ephemeral
            });
        } else {
            await interaction.reply({
                embeds: [this.buildReverseEmbed(url)],
                flags: MessageFlags.Ephemeral
            });
        }
    }

    buildReverseEmbed(url) {
        const encoded = encodeURIComponent(url);
        const yandex = `https://yandex.com/images/search?rpt=imageview&url=${encoded}`;
        const google = `https://lens.google.com/uploadbyurl?url=${encoded}`;
        const tineye = `https://www.tineye.com/search?url=${encoded}`;
        const iqdb = `https://www.iqdb.org/?url=${encoded}`;
        const saucenao = `https://saucenao.com/search.php?sort=size&order=desc&url=${encoded}`;
        const traceMoe = `https://trace.moe/?auto&url=${encoded}`;

        return new EmbedBuilder()
            .setTitle('Yandex')
            .setURL(yandex)
            .setImage(url)
            .setDescription(this.formatLinks({
                Google: google,
                TinEye: tineye,
                IQDB: iqdb,
                SauceNao: saucenao,
                TraceMoe: traceMoe
            }));
    }

    formatLinks(links) {
        let string = '';

        let i = 0;
        for (const name in links) {
            const link = links[name];
            const first = i === 0;

            if (!first) {
                string += ' • ';
            }

            string += this.bot.fmt.link(name, link);

            i++;
        }

        return string;
    }
}

module.exports = FileInteractionsPlugin;
