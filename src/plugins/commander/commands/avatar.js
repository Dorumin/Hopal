const { MessageAttachment } = require('discord.js');
const Command = require('../structs/Command.js');

class AvatarCommand extends Command {
    constructor(bot) {
        super(bot);
        this.aliases = ['avatar', 'avi', 'a'];

        this.shortdesc = `Gives you an avatar`;
        this.desc = `Uploads a copy of your, or someone else's, avatar`;
        this.usages = [
            '!avatar',
            '!a @Doru',
            '!a 155545848812535808'
        ];
    }

    getExtension(avatarHash) {
        return avatarHash.startsWith('a_') ? 'gif' : 'png';
    }

    getAvatar(user) {
        const avatarHash = user.avatar;
        const ext = getExtension(avatar);
        const url = `https://cdn.discordapp.com/avatars/${user.id}/${avatarHash}.${ext}?size=2048`;

        return new MessageAttachment(url, `avatar.${ext}`);
    }

    async call(message) {
        let user = message.mentions.users.first();

        if (!user) {
            const id = content.match(/\d{8,}/);

            if (id) {
                user = this.bot.client.users.cache.get(id[0]);
            }
        }

        if (!user) {
            user = message.author;
        }

        await message.channel.send(`${user.username}'s avatar`, {
            files: [
                this.getAvatar(user)
            ]
        });
    }
}

module.exports = AvatarCommand;
