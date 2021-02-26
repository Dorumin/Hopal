const got = require('got');
const Command = require('../structs/Command.js');

class TranslateCommand extends Command {
    constructor(bot) {
        super(bot);
        this.aliases = ['translate', 't'];

        this.shortdesc = `Translates some text`;
        this.desc = `
            Gives you the translation of some text you give, and a link to Google Translate
            You can choose what language to translate into by passing its code as a prefix, e.g. \`en\`i
            `;
        this.usages = [
            '!translate hola',
            `!translate es hello`,
            '!translate ro>en doru',
            '!t es i love you'
        ];
    }

    async call(message, content) {
        const { text, from, to } = this.extractData(content);

        const translation = await this.getTranslation({
            from,
            to,
            text
        });

        message.channel.send({
            embed: {
                title: 'Google Translate',
                url: `https://translate.google.com/?sl=${from}&tl=${to}&text=${encodeURIComponent(text)}&op=translate`,
                description: translation
            }
        });
    }

    extractData(content) {
        const match = content.match(/^([a-z]{2})(?:>([a-z]{2}))?\s/);

        let text;
        let from;
        let to;
        if (match) {
            text = content.slice(match[0].length);

            if (match[2]) {
                from = match[1];
                to = match[2];
            } else {
                from = 'auto';
                to = match[1];
            }
        } else {
            text = content;
            from = 'auto';
            to = 'en';
        }

        return {
            text,
            from,
            to
        };
    }

    async getTranslation({ from, to, text }) {
        const res = await got(`https://translate.googleapis.com/translate_a/single`, {
            searchParams: {
                client: 'gtx',
                dt: 't',
                sl: from,
                tl: to,
                q: text
            }
        }).json();

        const translation = res[0].map(res => res[0]).join('');

        return translation;
    }
}

module.exports = TranslateCommand;
