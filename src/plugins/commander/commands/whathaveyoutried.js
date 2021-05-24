const Command = require('../structs/Command.js');

class ProofOfEffortCommand extends Command {
    constructor(bot) {
        super(bot);
        this.aliases = ['whyt', 'whathaveyoutried'];

        this.shortdesc = `What have you tried?`;
        this.desc = `Links to a website that may possibly shed some light as to why no one wants to help you with your technical problem(s).`;
        this.usages = [
            '!whyt',
            '!whathaveyoutried'
            '!whathaveyoutried?'
        ];
    }

    call(message) {
        message.channel.send(`
Willingness and desire to learn are the true qualifications of a worthy question asker.
<https://mattgemmell.com/what-have-you-tried/>
        `)
    }
}

module.exports = ProofOfEffortCommand;
