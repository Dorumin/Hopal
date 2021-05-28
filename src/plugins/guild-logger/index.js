const { MessageEmbed } = require('discord.js');
const Plugin = require('../../structs/Plugin');
const FormatterPlugin = require('../fmt');

class GuildLoggerPlugin extends Plugin {
    static get deps() {
        return [
            FormatterPlugin
        ];
    }

    load() {
        this.bot.guildLogger = new GuildLogger(this.bot);
    }
}

class GuildLogger {
    constructor(bot) {
        this.bot = bot;
        this.config = bot.config.GUILD_LOGGER || {};
        this.guilds = this.config.GUILDS || {};

        this.collectEvents();

        this.bot.client.on('ready', this.onReady.bind(this));
    }

    collectEvents() {
        this.listeners = {};

        for (const guildId in this.guilds) {
            const guild = this.guilds[guildId];

            for (const channelId in guild.CHANNELS) {
                const channel = guild.CHANNELS[channelId];

                for (const logType of channel.LOG_TYPES) {
                    if (!this.listeners.hasOwnProperty(logType)) {
                        this.listeners[logType] = [];
                    }

                    this.listeners[logType].push({
                        guildId,
                        channelId
                    });
                }
            }
        }
    }

    onReady() {
        this.bot.client.on('emojiCreate', this.onEmojiCreate.bind(this));
        this.bot.client.on('messageUpdate', this.onMessageUpdate.bind(this));
        this.bot.client.on('messageDelete', this.onMessageDelete.bind(this));
        this.bot.client.on('voiceStateUpdate', this.onVoiceStateUpdate.bind(this));
    }

    async onEmojiCreate(emoji) {
        if (!this.listeners.EMOJI_CREATE) return;
        if (!emoji.guild) return;

        for (const listener of this.listeners.EMOJI_CREATE) {
            if (listener.guildId !== emoji.guild.id) continue;

            const channel = emoji.guild.channels.cache.get(listener.channelId);
            if (!channel) continue;

            console.log(emoji);

            let author = emoji.author;
            if (!author) {
                try {
                    author = await emoji.fetchAuthor();
                } catch(e) {
                    console.log(e);
                }
            }

            console.log(author);

            let description;
            if (author) {
                description = `<@${emoji.author.id}> has created the emoji ${emoji}`;
            } else {
                description = `The ${emoji} emoji was created`;
            }

            channel.send(
                new MessageEmbed()
                    .setDescription(description)
                    .setImage(emoji.url)
                    .setFooter('Emoji create')
                    .setTimestamp()
            );
        }
    }

    onMessageUpdate(oldMessage, newMessage) {
        if (!this.listeners.MESSAGE_UPDATE) return;
        if (!newMessage.guild) return;
        if (oldMessage.content === newMessage.content) return;

        for (const listener of this.listeners.MESSAGE_UPDATE) {
            if (listener.guildId !== newMessage.guild.id) continue;

            const channel = newMessage.guild.channels.cache.get(listener.channelId);
            if (!channel) contiue;

            let description = `<@${newMessage.author.id}> edited a message in <#${newMessage.channel.id}>`;

            if (oldMessage.content) {
                description += `\n\nContent was:\n${oldMessage.content}`;

                // Not that necessary
                //
                // const extra = '\n\nNow is:\n' + newMessage.content;
                //
                // if ((description + extra).length <= 2048) {
                //     description += extra;
                // }
            }

            channel.send(
                new MessageEmbed()
                    .setTitle('Message link')
                    .setURL(newMessage.url)
                    .setDescription(description)
                    .setFooter('Message edit', newMessage.author.avatarURL())
                    .setTimestamp()
            );
        }
    }

    onMessageDelete(message) {
        if (!this.listeners.MESSAGE_DELETE) return;
        if (!message.guild) return;

        for (const listener of this.listeners.MESSAGE_DELETE) {
            if (listener.guildId === message.guild.id) continue;

            const channel = message.guild.channels.cache.get(listener.channelId);
            if (!channel) continue;

            let description = `<@${message.author.id}> deleted a message in <#${message.channel.id}>`;

            if (message.content) {
                description += `\n\n${message.content}`;
            }

            channel.send(
                new MessageEmbed()
                    .setTitle('Message link')
                    .setURL(message.url)
                    .setDescription(description)
                    .setFooter('Message delete', message.author.avatarURL())
                    .setTimestamp()
            );

            for (const attachment of message.attachments.values()) {
                channel.send({
                    files: [
                        attachment
                    ]
                });
            }
        }
    }

    onVoiceStateUpdate(prevState, curState) {
        // If channelID was null or undefined, user wasn't/isn't in VC
        const hasJoined = prevState.channelID == undefined;
        const hasLeft = curState.channelID == undefined;

        const startedStreaming = !prevState.streaming && curState.streaming;
        const stoppedStreaming = prevState.streaming && !curState.streaming;

        const { guild, id: userId, channelID: channelId } = prevState;

        if (hasJoined) {
            this.onUserJoinVoice({ guild, userId, channelId });
            return;
        }

        if (hasLeft) {
            this.onUserLeaveVoice({ guild, userId, channelId });
            return;
        }

        if (startedStreaming) {
            this.onUserStartStreaming({ guild, userId, channelId });
            return;
        }

        if (stoppedStreaming) {
            this.onUserStopStreaming({ guild, userId, channelId });
            return;
        }
    }

    onUserJoinVoice({ guild, userId, channelId }) {
        if (!this.listeners.VOICE_JOIN) return;

        for (const listener of this.listeners.VOICE_JOIN) {
            if (listener.guildId !== guild.id) continue;

            const channel = guild.channels.cache.get(listener.channelId);
            const voiceChannel = guild.channels.cache.get(channelId);
            const member = guild.members.cache.get(userId);

            if (channel && voiceChannel && member) {
                channel.send(
                    new MessageEmbed()
                        .setDescription(`<@${userId}> joined the voice channel ${this.bot.fmt.bold(voiceChannel.name)}`)
                        .setFooter('Voice join', member.user.avatarURL())
                        .setTimestamp()
                );
            } else {
                console.log('Missing a cache entry in log event');
                console.log(channel);
                console.log(voiceChannel);
                console.log(member);
            }
        }
    }

    onUserLeaveVoice({ guild, userId, channelId }) {
        if (!this.listeners.VOICE_LEAVE) return;

        for (const listener of this.listeners.VOICE_LEAVE) {
            if (listener.guildId !== guild.id) continue;

            const channel = guild.channels.cache.get(listener.channelId);
            const voiceChannel = guild.channels.cache.get(channelId);
            const member = guild.members.cache.get(userId);

            if (channel && voiceChannel && member) {
                channel.send(
                    new MessageEmbed()
                        .setDescription(`<@${userId}> left the voice channel ${this.bot.fmt.bold(voiceChannel.name)}`)
                        .setFooter('Voice leave', member.user.avatarURL())
                        .setTimestamp()
                );
            } else {
                console.log('Missing a cache entry in log event');
                console.log(channel);
                console.log(voiceChannel);
                console.log(member);
            }
        }
    }

    onUserStartStreaming({ guild, channelId, userId }) {
        if (!this.listeners.STREAM_START) return;

        for (const listener of this.listeners.STREAM_START) {
            if (listener.guildId !== guild.id) continue;

            const channel = guild.channels.cache.get(listener.channelId);
            const voiceChannel = guild.channels.cache.get(channelId);
            const member = guild.members.cache.get(userId);

            if (channel && voiceChannel && member) {
                channel.send(
                    new MessageEmbed()
                        .setDescription(`<@${userId}> started streaming in ${this.bot.fmt.bold(voiceChannel.name)}`)
                        .setFooter('Stream start', member.user.avatarURL())
                        .setTimestamp()
                );
            } else {
                console.log('Missing a cache entry in log event');
                console.log(channel);
                console.log(voiceChannel);
                console.log(member);
            }
        }
    }

    onUserStopStreaming({ guild, userId, channelId}) {
        if (!this.listeners.STREAM_END) return;

        for (const listener of this.listeners.STREAM_END) {
            if (listener.guildId !== guild.id) continue;

            const channel = guild.channels.cache.get(listener.channelId);
            const voiceChannel = guild.channels.cache.get(channelId);
            const member = guild.members.cache.get(userId);

            if (channel && voiceChannel && member) {
                channel.send(
                    new MessageEmbed()
                        .setDescription(`<@${userId}> stopped streaming in ${this.bot.fmt.bold(voiceChannel.name)}`)
                        .setFooter('Stream end', member.user.avatarURL())
                        .setTimestamp()
                );
            } else {
                console.log('Missing a cache entry in log event');
                console.log(channel);
                console.log(voiceChannel);
                console.log(member);
            }
        }
    }
}

module.exports = GuildLoggerPlugin;
