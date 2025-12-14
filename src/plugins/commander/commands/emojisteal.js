const Command = require('../structs/Command.js');

class EmojiStealCommand extends Command {
    constructor(bot) {
        super(bot);
        this.aliases = ['emoji steal', 'emote steal', 'emojisteal'];

        this.shortdesc = 'Steals an emoji';
        this.desc = `
            Attempts to steal an emoji and upload it to this server.`;
        this.usages = [
            '!emoji steal :custom_emote:',
            '!emote steal <reply to a message with an emote>'
        ];
    }

    extractEmojis(message) {
        const EMOJIS_REGEX = /<(a?):(\w+):(\d+)>/g;
        const EMOJIS_URL_REGEX = /https?:\/\/cdn\.discordapp\.com\/emojis\/(\d+).(png|gif|webp)\S*/g;

        const results = [];

        for (const result of message.content.matchAll(EMOJIS_REGEX)) {
            const animated = result[1] === 'a';
            const name = result[2];
            const id = result[3];

            results.push({
                animated,
                name,
                id,
                url: `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=256&name=${name}`
            });
        }

        if (results.length > 0) return results;

        for (const result of message.content.matchAll(EMOJIS_URL_REGEX)) {
            const url = new URL(result[0]);
            const id = result[1];
            const extension = result[2];
            const animated = extension === 'gif' || url.searchParams.get('animated') === 'true';
            const name = url.searchParams.get('name') || `emoji${results.length}`;

            results.push({
                animated,
                name,
                id,
                url: `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=256&name=${name}`
            });
        }

        if (results.length > 0) return results;

        for (const attachment of message.attachments.values()) {
            const url = new URL(attachment.url);
            const animated = url.pathname.endsWith('.gif');
            const name = attachment.name.split('.').shift() || `emoji${results.length}`;

            results.push({
                animated,
                name,
                id: null,
                url: attachment.url
            });
        }

        return results;
    }

    async call(message) {
        let extracted = this.extractEmojis(message);

        if (extracted.length === 0 && message.reference) {
            const referenced = await message.channel.messages.fetch(message.reference.messageId);

            const extractedReference = this.extractEmojis(referenced);

            if (extractedReference.length === 0) {
                await message.channel.send('No emoji found in referenced message');
                return;
            } else {
                extracted = extractedReference;
            }
        }

        if (extracted.length === 0) {
            await message.channel.send('No emoji found in your message');
            return;
        }

        const created = [];
        let failed = 0;

        for (const file of extracted) {
            try {
                const emoji = await message.guild.emojis.create({
                    attachment: file.url,
                    name: file.name
                });

                created.push(emoji);
            } catch(e) {
                failed++;
            }
        }

        let response = `Stolem ${created.length} emotes: ${created.map(emoji => `${emoji}`).join(' ')}`;

        if (failed > 0) {
            response += `\n\nFailed to create ${failed} emotes. Probably missing rights or limit reached.`;
        }

        await message.channel.send(response.trim());
    }
}

module.exports = EmojiStealCommand;
