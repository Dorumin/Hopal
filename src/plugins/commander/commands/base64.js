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
            return [string];
        }

        return [string.slice(0, index), string.slice(index + scan.length)];
    }

    async call(message, content) {
        const split = this.splitFirst(content, ' ');
        const [ arg, string ] = split;

        let result;
        switch (arg) {
            case 'd':
            case 'decode':
            case 'decrypt':
                result = Buffer.from(string, 'base64').toString();
                break;
            case 'e':
            case 'encode':
            case 'encrypt':
                result = Buffer.from(string, 'utf8').toString('base64');
                break;
            default:
                try {
                    result = Buffer.from(content, 'base64').toString();
                } catch(e) {
                    result = Buffer.from(content, 'utf8').toString('base64');
                }
        }

        await message.channel.send(result);
    }
}

module.exports = Base64Command; 
