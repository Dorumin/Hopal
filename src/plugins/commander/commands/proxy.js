const { SlashCommandBuilder } = require('@discordjs/builders');
const Command = require('../structs/Command.js');

class ProxyCommand extends Command {
	constructor(bot) {
		super(bot);
		this.aliases = ['proxy'];
        this.schema = new SlashCommandBuilder()
            .addUserOption(option =>
                option.setName('target')
                    .setDescription('User to DM with proxied link')
                    .setRequired(false)
            );

		this.shortdesc = 'Generates a proxymin link.';
		this.desc = `
					Generates a https://proxymin.herokuapp.com link.
					Can optionally send the proxied link to a user.`;
		this.usages = [
			'!proxy'
		];
	}

    extractUrlFromMessage(message, content) {
        for (const attachment of message.attachments.values()) {
            if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                return attachment.url;
            }
        }

        return encodeURIComponent(decodeURIComponent(content));
    }

	async call(message, content) {
        const startIdMatch = content.match(/^(?:<@!?(\d+)>|(\d+))/);
        const startId = startIdMatch && (startIdMatch[1] ?? startIdMatch[2]);
        const rest = startIdMatch ? content.slice(startIdMatch[0].length).trimStart() : content;
        const url = this.extractUrlFromMessage(message, rest)
            // replace first :// encoded with canonical
            // this is completely aesthetic, the server can handle both versions
            .replace('%3A%2F%2F', '://');

        let channel;
        if (startId) {
            channel = await message.guild?.members.fetch(startId);
        }
        if (!channel) {
            channel = message.channel;
        }

		await channel.send(`https://proxymin.herokuapp.com/${url}`);

        try {
            await message.suppressEmbeds();
        } catch(e) {}
	}
}

module.exports = ProxyCommand;
