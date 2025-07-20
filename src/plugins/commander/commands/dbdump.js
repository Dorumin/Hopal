const { AttachmentBuilder } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const OPCommand = require('../structs/OPCommand.js');
const SQLPlugin = require('../../sql');

class DBDumpCommand extends OPCommand {
    static get deps() {
        return [
            SQLPlugin
        ];
    }

    constructor(bot) {
        super(bot);
        this.aliases = ['dbdump'];
        this.schema = new SlashCommandBuilder();

        this.hidden = true;
        this.shortdesc = `Generates a database dump for a rainy day.`;
        this.desc = `
                    .`;
        this.usages = [
            '!dbdump'
        ];
        this.examples = [
            '!dbdump'
        ];

        // Dummy handle, just to keep track of it
        this.sql = this.bot.sql.handle('dbdump command');
    }

    async call(message) {
        await message.channel.send({
            files: [
                new AttachmentBuilder(this.bot.sql.db.serialize(), {
                    name: 'sql.db',
                    description: `It's a sqlite file. Careful where you put it`
                })
            ]
        });
    }
}

module.exports = DBDumpCommand;
