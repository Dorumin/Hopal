const Command = require('../structs/Command.js');

class Base64Command extends Command {
    constructor(bot) {
        super(bot);
        this.aliases = ['base64', 'b64', '64'];
        this.shortdesc = `Encrypts or decrypts a base64 string`;
        this.desc = `Encrypts or decrypts a base64 string. Defaults to decrypt if no other argument is present`;
        this.usages = [
            '!base64 R29vZGJ5ZSBsb3Zlcg==',
            '!b64 e Fuck you',
            '!64 decrypt R29vZGJ5ZSBsb3Zlcg=='
        ];
    }

    splitFirst(string, scan) {
        const index = string.indexOf(scan);
        if (index === -1) {
            return [ string ];
        }

        return [
            string.slice(0, index),
            string.slice(index + scan.length)
        ];
    }

    isValidUTF8(buffer) {
        return Buffer.compare(Buffer.from(buffer.toString(), 'utf8'), buffer) === 0;
    }

    async call(message, content) {
        if (!content) {
            await message.channel.send('Please supply a string to encode or decode.');
            return;
        }
        const [ mode, string ] = this.splitFirst(content, ' ');

        let result;
        switch (mode) {
            case 'd':
            case 'decode':
            case 'decrypt':
                result = Buffer.from(string, 'base64').toString('utf8');
                break;
            case 'e':
            case 'encode':
            case 'encrypt':
                result = Buffer.from(string, 'utf8').toString('base64');
                break;
            default:
                const buffer = Buffer.from(content, 'base64');

                if (this.isValidUTF8(buffer)) {
                    result = buffer.toString('utf8');
                } else {
                    result = Buffer.from(content, 'utf8').toString('base64');
                }
        }

        await message.channel.send(result);
    }
}

module.exports = Base64Command;
