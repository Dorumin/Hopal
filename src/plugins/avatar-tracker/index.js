const { MessageAttachment } = require('discord.js');
const Plugin = require('../../structs/Plugin');

class AvatarTrackerPlugin extends Plugin {
    load() {
        this.bot.avatarTracker = new AvatarTracker(this.bot);
    }
}

class AvatarTracker {
    constructor(bot) {
        this.bot = bot;
        this.config = bot.config.AVATAR_TRACKER || {};
        this.users = new Set(this.config.USERS || []);

        this.bot.client.on('ready', this.onReady.bind(this));
    }

    onReady() {
        this.bot.client.on('userUpdate', this.onUserUpdate.bind(this));
    }

    onUserUpdate(oldUser, newUser) {
        const avatarHasChanged = oldUser.avatar !== newUser.avatar;

        if (avatarHasChanged) {
            this.onUserAvatarChange(newUser);
        }
    }

    onUserAvatarChange(user) {
        if (!this.users.has(user.id)) return;

        user.send(`Here's your new avatar!`, {
            files: [
                this.getAvatar(user)
            ]
        });
    }

    getAvatar(user) {
        const ext = this.getExtension(user.avatar);
        const url = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=2048`;
        const filename = `avatar.${ext}`;

        return new MessageAttachment(url, filename);
    }

    getExtension(avatarHash) {
        return avatarHash.startsWith('a_') ? 'gif' : 'png';
    }
}

module.exports = AvatarTrackerPlugin;
