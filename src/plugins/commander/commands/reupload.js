const { SlashCommandBuilder } = require('@discordjs/builders');
const { AttachmentBuilder } = require('discord.js');
const Command = require('../structs/Command.js');

class ReuploadCommand extends Command {
	constructor(bot) {
		super(bot);
		this.aliases = ['reupload'];
        this.schema = new SlashCommandBuilder()
            .addUserOption(option =>
                option.setName('target')
                    .setDescription('User to DM with reuploaded file')
                    .setRequired(false)
            );

		this.shortdesc = 'Reuploads a link.';
		this.desc = `
					Reuploads a link as a file. 8mb limit.
					Can optionally send the proxied link to a user.`;
		this.usages = [
			'!reupload'
		];
	}

    extractUrlFromMessage(message, content) {
        for (const attachment of message.attachments.values()) {
            if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                return attachment.url;
            }
        }

        return content;
    }

	async call(message, content) {
        const startIdMatch = content.match(/^(?:<@!?(\d+)>|(\d+))/);
        const startId = startIdMatch && (startIdMatch[1] ?? startIdMatch[2]);
        const rest = startIdMatch ? content.slice(startIdMatch[0].length).trimStart() : content;
        const url = this.extractUrlFromMessage(message, rest);

        let channel;
        if (startId) {
            channel = await message.guild?.members.fetch(startId);
        }
        if (!channel) {
            channel = message.channel;
        }

        await channel.send({
            files: [
                new AttachmentBuilder(url)
            ]
        });

        try {
            await message.suppressEmbeds();
        } catch(e) {}
	}
}

module.exports = ReuploadCommand;
