const got = require('got');
const { table, getBorderCharacters } = require('table');
const { MessageAttachment } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');
const OPCommand = require('../structs/OPCommand.js');
const SeenPlugin = require('../../seen/index.js');

class SeenCommand extends OPCommand {
    static get deps() {
        return [
            SeenPlugin
        ];
    }

    constructor(bot) {
        super(bot);
        this.aliases = ['seen'];
        this.schema = new SlashCommandBuilder()
            .addUserOption(option =>
                option.setName('target')
                    .setDescription('The user to check')
            );;

        this.shortdesc = `Check when someone was last seen.`;
        this.desc = `
                    Query the last time a user was seen by the bot.`;
        this.usages = [
            '!seen <@mention>',
            '!seen <user id>'
        ];
        this.examples = [
            '!seen @Doru',
            '!seen 155545848812535808'
        ];
    }

    async call(message, content) {
        const userId = [...message.mentions.users.values()].map(user => user.id)[0] ?? content.match(/\d+/g)?.[0] ?? '';

        if (!userId) {
            await message.channel.send('I see you');
            return;
        }

        try {
            const times = await this.bot.seen.getTimes(userId);
            let alreadyOn = false;
            try {
                const status = message.guild?.members.cache.get(userId)?.presence?.status;

                alreadyOn = status === 'online' || status === 'dnd';
            } catch(e) {}

            await message.channel.send(this.getResponse(alreadyOn, times));
        } catch(e) {
            await message.channel.send(`I don't know who <@${userId}> is`);
        }
    }

    getResponse(alreadyOn, times) {
        const fo = times.lastOnline !== null && this.formatElapsed(times.lastOnline);
        const fa = times.lastAction !== null && this.formatElapsed(times.lastAction);
        const hasOnline = times.lastOnline !== null && fo !== 'right now';
        const hasAction = times.lastAction !== null && fa !== 'right now';

        console.log(`${alreadyOn}-${hasOnline}-${hasAction}`);
        switch (`${alreadyOn}-${hasOnline}-${hasAction}`) {
            case 'false-false-false':
                // Should never have a double null on the db so this should error elsewhere
                return `I don't know who you're talking about.`
            case 'true-false-false':
            case 'true-true-false':
                return `Looks like that user is on right now. Why not go and ask?`
            case 'true-false-true':
            case 'true-true-true':
                return `Looks like that user is on right now.\nThe last time I saw it do something was ${this.formatElapsed(times.lastAction)}`;
            case 'false-false-true':
                return `The last time I saw that user do something was on ${this.formatElapsed(times.lastAction)}`;
            case 'false-true-false':
                return `The last time I saw them online was ${this.formatElapsed(times.lastOnline)}`;
            case 'false-true-true':
                return `The last time I saw them online was ${this.formatElapsed(times.lastOnline)}\nAlso, the last time I saw them do something was ${this.formatElapsed(times.lastAction)}`;
            default:
                return `The orb.`
        }
    }

    formatElapsed(then) {
        const now = Date.now();
        let elapsed = now - then.getTime();
        const what = elapsed < 0 ? 'in the future (???)' : 'ago';

        const days = Math.floor(elapsed / (1000 * 60 * 60 * 24));
        elapsed %= 1000 * 60 * 60 * 24;
        const hours = Math.floor(elapsed / (1000 * 60 * 60));
        elapsed %= 1000 * 60 * 60;
        const minutes = Math.floor(elapsed / (1000 * 60));
        elapsed %= 1000 * 60;
        const seconds = Math.floor(elapsed / 1000);

        const segments = [
            days > 0 && this.plural(days, `${days} day`, `${days} days`),
            hours > 0 && this.plural(hours, `${hours} hour`, `${hours} hours`),
            minutes > 0 && this.plural(minutes, `${minutes} minute`, `${minutes} minutes`),
            seconds > 0 && this.plural(seconds, `${seconds} second`, `${seconds} seconds`),
        ].filter(Boolean);

        switch (segments.length) {
            case 0:
                return 'right now';
            case 1:
                return `${segments[0]} ${what}`;
            case 2:
                return `${segments[0]} and ${segments[1]} ${what}`;
            default:
                return `${segments.slice(0, -1).join(', ')} and ${segments[segments.length - 1]} ${what}`;
        }
    }

    plural(n, sing, plur) {
        return Math.abs(n) === 1 ? sing : plur;
    }
}

module.exports = SeenCommand;
