const Command = require('../structs/Command.js');

class PickCommand extends Command {
    constructor(bot) {
        super(bot);
        this.aliases = ['pick', 'choose', 'decide'];

        this.shortdesc = `Thinks for you`;
        this.desc = `Decides important life changing decisions`;
        this.usages = [
            '!pick 1; 2; 3; 4'
        ];
    }

    call(message, content) {
        const split = content.split(';');
        const chosen =  split[Math.floor(Math.random() * split.length)].trim();

        message.channel.send(`I pick **`${chosen}`**);
    }
}

module.exports = PickCommand;
