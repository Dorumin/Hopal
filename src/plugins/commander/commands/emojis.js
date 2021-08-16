const { MessageEmbed } = require('discord.js');
const AdminCommand = require('../structs/AdminCommand.js');
const FormatterPlugin = require('../../fmt');

class EmojisCommand extends AdminCommand {
    static get deps() {
        return [
            FormatterPlugin
        ];
    }

    constructor(bot) {
        super(bot);
        this.aliases = ['emojis', 'emotes'];

        this.shortdesc = 'Posts a list of the server emotes';
        this.desc = `
            Posts one or more embeds listing all the server emoticons.`;
        this.usages = [
            '!emojis'
        ];
    }

    async call(message) {
        const emojis = message.guild.emojis.cache.sort((a, b) => {
            return a.name.localeCompare(b.name);
        });

        const staticEmoji = emojis.filter(emoji => !emoji.animated);
        const animatedEmoji = emojis.filter(emoji => emoji.animated);

        const embeds = [];

        let embed = new MessageEmbed();

        embed.setTitle(`${staticEmoji.size} emojis`);

        let description = '';
        for (const emoji of staticEmoji.values()) {
            const line = `${emoji} ${emoji.name}\n`;

            if (description.length + line.length > 2048) {
                embed.setDescription(description);
                description = '';

                embeds.push(embed);
                embed = new MessageEmbed();
            }

            description += line;
        }

        embed.setDescription(description);

        let field = '';
        for (const emoji of animatedEmoji.values()) {
            const line = `${emoji} ${emoji.name}\n`;

            if (field.length + line.length > 1024) {
                embed.addField(`${animatedEmoji.size} animated emojis`, field);

                field = '';
            }

            field += line;
        }

        embed.addField(`${animatedEmoji.size} animated emojis`, field);

        embeds.push(embed);

        for (const embed of embeds) {
            await message.channel.send(embed);
        }
    }
}

module.exports = EmojisCommand;
