const { EmbedBuilder, AttachmentBuilder, SnowflakeUtil } = require('discord.js');
const Plugin = require('../../structs/Plugin');
const FormatterPlugin = require('../fmt');
const { ActivityType } = require('discord-api-types/v9');

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
        this.bot.client.on('guildUpdate', this.onGuildUpdate.bind(this));
        this.bot.client.on('messageUpdate', this.onMessageUpdate.bind(this));
        this.bot.client.on('messageDelete', this.onMessageDelete.bind(this));
        this.bot.client.on('voiceStateUpdate', this.onVoiceStateUpdate.bind(this));
        this.bot.client.on('guildMemberUpdate', this.onGuildMemberUpdate.bind(this));
        this.bot.client.on('presenceUpdate', this.onPresenceUpdate.bind(this));
    }

    async onEmojiCreate(emoji) {
        if (!this.listeners.EMOJI_CREATE) return;
        if (!emoji.guild) return;

        for (const listener of this.listeners.EMOJI_CREATE) {
            if (listener.guildId !== emoji.guild.id) continue;

            const channel = emoji.guild.channels.cache.get(listener.channelId);
            if (!channel) continue;

            let author = emoji.author;
            if (!author) {
                try {
                    author = await emoji.fetchAuthor();
                } catch(e) {}
            }

            let description;
            if (author) {
                description = `<@${emoji.author.id}> has created the emoji ${emoji}`;
            } else {
                description = `The ${emoji} emoji was created`;
            }

            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(description)
                        .setImage(emoji.url)
                        .setFooter({ text: 'Emoji create' })
                        .setTimestamp()
                ]
            });
        }
    }

    onGuildUpdate(oldGuild, newGuild) {
        const changedIcon = oldGuild.icon !== newGuild.icon;
        const changedName = oldGuild.name !== newGuild.name;

        if (changedIcon) {
            this.onGuildIconChange(oldGuild, newGuild);
        }

        if (changedName) {
            this.onGuildNameChange(oldGuild, newGuild);
        }
    }

    async onGuildIconChange(oldGuild, newGuild) {
        if (!this.listeners.GUILD_ICON_CHANGE) return;

        for (const listener of this.listeners.GUILD_ICON_CHANGE) {
            if (listener.guildId !== newGuild.id) continue;

            const channel = newGuild.channels.cache.get(listener.channelId);
            if (!channel) continue;

            await channel.send({
                // This embed has duplicate thumbnail and footer icon
                // I believe footer icons are so smol they're saved forever,
                // while thumbnails are cached in the media proxy for a bit
                // Eventually the old server icon would be deleted,
                // and it will live on in the footer
                // The new icon is uploaded directly
                embeds: [
                    new EmbedBuilder()
                        .setDescription('The guild icon was changed')
                        .setImage(
                            oldGuild.iconURL({
                                format: 'png',
                                dynamic: true,
                                size: 2048
                            })
                        )
                        .setFooter({
                            text: 'Guild icon change',
                            iconURL: oldGuild.iconURL({
                                format: 'png',
                                dynamic: true,
                                size: 2048
                            })
                        })
                        .setTimestamp()
                ]
            });

            const newIconAnim = newGuild.icon.startsWith('a_');

            await channel.send({
                content: 'New icon:',
                files: [
                    new AttachmentBuilder(
                        newGuild.iconURL({
                            format: 'png',
                            dynamic: true,
                            size: 2048
                        }),
                        { filename: `icon.${newIconAnim ? 'gif' : 'png'}`, description: `${newGuild.name}'s new icon` }
                    )
                ]
            });
        }
    }

    async onGuildNameChange(oldGuild, newGuild) {
        if (!this.listeners.GUILD_NAME_CHANGE) return;

        for (const listener of this.listeners.GUILD_NAME_CHANGE) {
            if (listener.guildId !== newGuild.id) continue;

            const channel = newGuild.channels.cache.get(listener.channelId);
            if (!channel) continue;

            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`Guild name was updated`)
                        .addField('Old name', oldGuild.name, true)
                        .addField('New name', newGuild.name, true)
                        .setFooter({
                            text: 'Guild name change',
                            iconURL: message.guild.iconURL({
                                format: 'png',
                                dynamic: true,
                                size: 32
                            })
                        })
                        .setTimestamp()
                ]
            });
        }
    }

    async onMessageUpdate(oldMessage, newMessage) {
        if (!this.listeners.MESSAGE_UPDATE) return;
        if (!newMessage.guild) return;
        if (oldMessage.content === newMessage.content) return;

        for (const listener of this.listeners.MESSAGE_UPDATE) {
            if (listener.guildId !== newMessage.guild.id) continue;

            const channel = newMessage.guild.channels.cache.get(listener.channelId);
            if (!channel) continue;

            let description = `<@${newMessage.author.id}> edited a message in <#${newMessage.channel.id}>`;

            if (oldMessage.content) {
                description += `\n\nContent was:\n${oldMessage.content}`;

                // Not that necessary
                // It's not that necessary but I want it
                const extra = '\n\nNow it\'s:\n' + newMessage.content;

                if ((description + extra).length <= 2048) {
                    description += extra;
                }
            }

            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Message link')
                        .setURL(newMessage.url)
                        .setDescription(description)
                        .setFooter({
                            text: 'Message edit',
                            iconURL: newMessage.author.avatarURL()
                        })
                        .setTimestamp()
                ]
            });
        }
    }

    async onMessageDelete(message) {
        if (!this.listeners.MESSAGE_DELETE) return;
        if (!message.guild) return;

        for (const listener of this.listeners.MESSAGE_DELETE) {
            if (listener.guildId !== message.guild.id) continue;

            const channel = message.guild.channels.cache.get(listener.channelId);
            if (!channel) continue;

            let description = `A message by <@${message.author.id}> ` +
                `was deleted in <#${message.channel.id}>`;

            try {
                // Attempt to find out the user who deleted the message
                const auditLogs = await message.guild.fetchAuditLogs({
                    limit: 1
                });
                const latest = auditLogs.entries.first();
                const elapsed = Date.now() - SnowflakeUtil.deconstruct(latest.id).timestamp;

                if (
                    latest.action === 'MESSAGE_DELETE' &&
                    latest.target.id === message.author.id &&
                    latest.extra.channel.id === message.channel.id &&
                    elapsed < 1000
                ) {
                    description = `A message by <@${message.author.id}> ` +
                        `was deleted in <#${message.channel.id}> ` +
                        `by <@${latest.executor.id}>`;
                }
            } catch(e) {}

            if (message.content) {
                description += `\n\n`;

                if (message.reference) {
                    const { guildId, channelId, messageId } = message.reference;

                    description += this.bot.fmt.link(
                        'Reply to',
                        `https://discord.com/channels/${guildId}/${channelId}/${messageId}`
                    ) + '\n';
                }

                description += message.content;
            }

            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Message link')
                        .setURL(message.url)
                        .setDescription(description)
                        .setFooter({
                            text: 'Message delete',
                            iconURL: message.author.avatarURL()
                        })
                        .setTimestamp()
                ]
            });

            for (const attachment of message.attachments.values()) {
                await channel.send({
                    files: [
                        attachment
                    ]
                });
            }
        }
    }

    onVoiceStateUpdate(prevState, curState) {
        // If channelId was null or undefined, user wasn't/isn't in VC
        const hasJoined = prevState.channelId == undefined;
        const hasLeft = curState.channelId == undefined;

        const startedStreaming = !prevState.streaming && curState.streaming;
        const stoppedStreaming = prevState.streaming && !curState.streaming;

        const { guild, id: userId, channelId } = prevState;

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

    async onUserJoinVoice({ guild, userId, channelId }) {
        if (!this.listeners.VOICE_JOIN) return;

        for (const listener of this.listeners.VOICE_JOIN) {
            if (listener.guildId !== guild.id) continue;

            const channel = guild.channels.cache.get(listener.channelId);
            const voiceChannel = guild.channels.cache.get(channelId);
            const member = guild.members.cache.get(userId);

            if (channel && voiceChannel && member) {
                await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`<@${userId}> joined the voice channel ${this.bot.fmt.bold(voiceChannel.name)}`)
                            .setFooter({
                                text: 'Voice join',
                                iconURL: member.user.avatarURL()
                            })
                            .setTimestamp()
                    ]
                });
            } else {
                console.log('Missing a cache entry in log event');
                console.log(channel);
                console.log(voiceChannel);
                console.log(member);
            }
        }
    }

    async onUserLeaveVoice({ guild, userId, channelId }) {
        if (!this.listeners.VOICE_LEAVE) return;

        for (const listener of this.listeners.VOICE_LEAVE) {
            if (listener.guildId !== guild.id) continue;

            const channel = guild.channels.cache.get(listener.channelId);
            const voiceChannel = guild.channels.cache.get(channelId);
            const member = guild.members.cache.get(userId);

            if (channel && voiceChannel && member) {
                await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`<@${userId}> left the voice channel ${this.bot.fmt.bold(voiceChannel.name)}`)
                            .setFooter({
                                text: 'Voice leave',
                                iconURL: member.user.avatarURL()
                            })
                            .setTimestamp()
                    ]
                });
            } else {
                console.log('Missing a cache entry in log event');
                console.log(channel);
                console.log(voiceChannel);
                console.log(member);
            }
        }
    }

    async onUserStartStreaming({ guild, channelId, userId }) {
        if (!this.listeners.STREAM_START) return;

        for (const listener of this.listeners.STREAM_START) {
            if (listener.guildId !== guild.id) continue;

            const channel = guild.channels.cache.get(listener.channelId);
            const voiceChannel = guild.channels.cache.get(channelId);
            const member = guild.members.cache.get(userId);

            if (channel && voiceChannel && member) {
                await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`<@${userId}> started streaming in ${this.bot.fmt.bold(voiceChannel.name)}`)
                            .setFooter({
                                text: 'Stream start',
                                iconURL: member.user.avatarURL()
                            })
                            .setTimestamp()
                    ]
                });
            } else {
                console.log('Missing a cache entry in log event');
                console.log(channel);
                console.log(voiceChannel);
                console.log(member);
            }
        }
    }

    async onUserStopStreaming({ guild, userId, channelId}) {
        if (!this.listeners.STREAM_END) return;

        for (const listener of this.listeners.STREAM_END) {
            if (listener.guildId !== guild.id) continue;

            const channel = guild.channels.cache.get(listener.channelId);
            const voiceChannel = guild.channels.cache.get(channelId);
            const member = guild.members.cache.get(userId);

            if (channel && voiceChannel && member) {
                await channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`<@${userId}> stopped streaming in ${this.bot.fmt.bold(voiceChannel.name)}`)
                            .setFooter({
                                text: 'Stream end',
                                iconURL: member.user.avatarURL()
                            })
                            .setTimestamp()
                    ]
                });
            } else {
                console.log('Missing a cache entry in log event');
                console.log(channel);
                console.log(voiceChannel);
                console.log(member);
            }
        }
    }

    onGuildMemberUpdate(oldMember, newMember) {
        const nicknameChanged = oldMember.nickname !== newMember.nickname;
        const usernameChanged = oldMember.user.tag !== newMember.user.tag;
        const updatedRoles = oldMember.roles.cache.difference(newMember.roles.cache);

        // TODO: Pending attribution on these two with the audit log
        if (nicknameChanged) {
            this.onNicknameChange(oldMember, newMember);
        }

        if (usernameChanged) {
            this.onUsernameChange(oldMember, newMember);
        }

        if (updatedRoles.size !== 0) {
            this.onRolesUpdate(newMember, updatedRoles);
        }
    }

    async onNicknameChange(oldMember, newMember) {
        if (!this.listeners.NICKNAME_CHANGE) return;

        for (const listener of this.listeners.NICKNAME_CHANGE) {
            if (listener.guildId !== newMember.guild.id) continue;

            const channel = newMember.guild.channels.cache.get(listener.channelId);
            if (!channel) continue;

            let description = `<@${newMember.user.id}>'s nickname was changed`;
            try {
                // Try to find out who updated the nickname
                const auditLogs = await newMember.guild.fetchAuditLogs({
                    limit: 1
                });
                const latest = auditLogs.entries.first();
                const elapsed = Date.now() - SnowflakeUtil.deconstruct(latest.id).timestamp;

                if (
                    latest.action === 'MEMBER_UPDATE' &&
                    latest.target.id === member.user.id &&
                    latest.changes.some(change => change.key === 'nick') &&
                    elapsed < 1000
                ) {
                    description = `<@${member.user.id}>'s nickname was updated `
                        + `by <@${latest.executor.id}>`;
                }
            } catch(e) {}

            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(description)
                        .addField('Old nickname', oldMember.nickname || '*<none>*', true)
                        .addField('New nickname', newMember.nickname || '*<none>*', true)
                        .setFooter({
                            text: 'Nickname change',
                            iconURL: newMember.user.avatarURL({
                                format: 'png',
                                dynamic: true,
                                size: 32
                            })
                        })
                        .setTimestamp()
                ]
            });
        }
    }

    async onUsernameChange(oldMember, newMember) {
        if (!this.listeners.USERNAME_CHANGE) return;

        for (const listener of this.listeners.USERNAME_CHANGE) {
            if (listener.guildId !== newMember.guild.id) continue;

            const channel = newMember.guild.channels.cache.get(listener.channelId);
            if (!channel) continue;

            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`<@${newMember.user.id}>'s username was changed`)
                        .addField('Old username', oldMember.user.tag, true)
                        .addField('New username', newMember.user.tag, true)
                        .setFooter({
                            text: 'Username change',
                            iconURL: newMember.user.avatarURL({
                                format: 'png',
                                dynamic: true,
                                size: 32
                            })
                        })
                        .setTimestamp()
                ]
            });
        }
    }

    async onRolesUpdate(member, updatedRoles) {
        if (!this.listeners.ROLES_UPDATE) return;

        for (const listener of this.listeners.ROLES_UPDATE) {
            if (listener.guildId !== member.guild.id) continue;

            const channel = member.guild.channels.cache.get(listener.channelId);
            if (!channel) continue;

            let description = `<@${member.user.id}>'s roles were updated`;
            try {
                // Try to find out who updated the roles
                const auditLogs = await member.guild.fetchAuditLogs({
                    limit: 1
                });
                const latest = auditLogs.entries.first();
                const elapsed = Date.now() - SnowflakeUtil.deconstruct(latest.id).timestamp;

                if (
                    latest.action === 'MEMBER_ROLE_UPDATE' &&
                    latest.target.id === member.user.id &&
                    elapsed < 1000
                ) {
                    description = `<@${member.user.id}>'s roles were updated `
                        + `by <@${latest.executor.id}>`;
                }
            } catch(e) {}

            const embed = new EmbedBuilder()
                .setDescription(description)
                .setFooter({
                    text: 'Roles update',
                    iconURL: member.user.avatarURL({
                        format: 'png',
                        dynamic: true,
                        size: 32
                    })
                })
                .setTimestamp();

            const added = updatedRoles.filter(role => member.roles.cache.has(role.id));
            const removed = updatedRoles.filter(role => !member.roles.cache.has(role.id));

            if (added.size !== 0) {
                embed.addField('Added roles', added.map(role => `<@&${role.id}>`).join('\n'));
            }

            if (removed.size !== 0) {
                embed.addField('Removed roles', removed.map(role => `<@&${role.id}>`).join('\n'));
            }

            await channel.send({
                embeds: [ embed ]
            });
        }
    }

    onPresenceUpdate(oldPresence, newPresence) {
        if (newPresence.status === 'offline') return;
        if (newPresence.user?.bot) return;

        const oldStatus = this.getPresenceStatus(oldPresence);
        const newStatus = this.getPresenceStatus(newPresence);
        const statusChanged = oldStatus !== newStatus;

        if (statusChanged) {
            this.onStatusChange(newPresence, oldStatus, newStatus);
        }
    }

    getPresenceStatus(presence) {
        const status = presence?.activities.find(activity =>
            activity.name === 'Custom Status' &&
            activity.type === ActivityType.Custom
        );

        return status?.state;
    }

    async onStatusChange(newPresence, oldStatus, newStatus) {
        if (!this.listeners.STATUS_CHANGE) return;

        const newMember = newPresence.member;

        if (!newMember) return;

        for (const listener of this.listeners.STATUS_CHANGE) {
            if (listener.guildId !== newMember.guild.id) continue;

            const channel = newMember.guild.channels.cache.get(listener.channelId);
            if (!channel) continue;

            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(`<@${newMember.user.id}>'s status was changed`)
                        .addField('Old status', oldStatus ?? '*<none>*', true)
                        .addField('New status', newStatus ?? '*<none>*', true)
                        .setFooter({
                            text: 'Status change',
                            iconURL: newMember.user.avatarURL({
                                format: 'png',
                                dynamic: true,
                                size: 32
                            })
                        })
                        .setTimestamp()
                ]
            });
        }
    }
}

module.exports = GuildLoggerPlugin;
