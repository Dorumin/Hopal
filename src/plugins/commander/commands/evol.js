const util = require('util');
const child_process = require('child_process');
const { BaseManager, MessageAttachment, MessageEmbed } = require('discord.js');
const Command = require('../structs/Command.js');
const OPCommand = require('../structs/OPCommand.js');
const FormatterPlugin = require('../../fmt');

const swallow = () => {};

class EvalCommand extends OPCommand {
    static get deps() {
        return [
            FormatterPlugin
        ];
    }

    constructor(bot) {
        super(bot);
        this.aliases = ['evol'];
        this.hidden = true;

        this.shortdesc = `Evaluates a piece of code.`;
        this.desc = `
                    Runs JavaScript in a non-sandboxed environment, and returns the value.
                    If you use a code block, it will get stripped out before evaluation.
                    You need to be a bot operator to use this command.`;
        this.usages = [
            '!eval <code>'
        ];
        this.examples = [
            '!eval send("Hello, world!")',
            '!eval 2 + 2 * 2 ** 2',
            '!eval ```js\nawait message.react("🤔");```'
        ];

        this.ignoredObjects = [];
	}

	inspect(object) {
		let str = '';
		let depth = 4;

		while (depth--) {
			str = util.inspect(object, {
                depth,
                compact: false
            });

            break;

			// if (str.length < 2000) break;
		}

        // Double the indent, from 2 spaces to 4
        str = str.replace(/^\s+/gm, '$&$&');

		return str;
	}

    require(channel, name) {
        try {
            return require(name);
        } catch(e) {
            // This is a HACK to essentially send a message on another thread
            // I use curl because I can't be assed to spawn a small js file to post with got
            // I tried to make this look as pretty as possible
            const url = `https://discord.com/api/v6/channels/${channel.id}/messages`;
            const body = JSON.stringify({
                content: `Dynamically loading ${name}...`
            });
            const headers = [
                ['Content-Type', 'application/json'],
                ['Authorization', `Bot ${this.bot.client.token}`]
            ].map(([k, v]) => `-H "${k}: ${v}"`).join(' ');

            // curl will start on another thread, and npm install with block this thread
            child_process.exec(`curl --data '${body}' ${headers} ${url}`);

            // got.post(url, {
            //     body,
            //     headers: {
            //         'Content-Type': 'application/json',
            //         'Authorization': `Bot ${this.bot.client.token}`
            //     }
            // });
            child_process.execSync(`npm install ${name}`);

            // Clear require cache
            delete require.cache[require.resolve(name)];

            return require(name);
        }
    }

    patchManagerClasses() {
        BaseManager.prototype.get = function(key) {
            return this.cache.get(key);
        };
    }

    unpatchManagerClasses() {
        delete BaseManager.prototype.get;
    }

    beforeEval(context) {
        // `with` throws an error, so, pollute the global with bindings
        for (const key in context) {
            global[key] = context[key];
        }

        this.patchManagerClasses();
    }

    afterEval(context) {
        // Clean up the global
        for (const key in context) {
            delete global[key];
        }

        this.unpatchManagerClasses();
    }

    getCode(content) {
        let code = content;

        // Strip code block
        if (code.startsWith('```') && code.endsWith('```')) {
            code = code.slice(3, -3);

            // If js or javascript was one of the first lines, strip it
            const firstLine = code.split('\n', 1)[0];
            if (['js', 'javascript'].includes(firstLine)) {
                code = code.replace(/^.+/, '');
            }
        }

        // Strip any leading semicolons, this shouldn't break anything
        code = code.replace(/;+$/g, '').trim();

        const isAsync = code.includes('await');
        const isSingleStatement = !code.includes(';') &&
            !/\b(if|while|for|try)\b/.test(code);

        if (isAsync) {
            code = `(async () => {
                ${isSingleStatement ? 'return ' : ''}${code};
            })()`;
        }

        return code;
    }

    getVars(message) {
        return {
            send: (...args) => {
                if (
                    args.length !== 1
                    || args[0].embed
                    || args[0].files
                    || args[0] instanceof MessageEmbed
                ) {
                    const promise = message.channel.send(...args);

                    this.ignoredObjects.push(promise);
                    promise.then(message => this.ignoredObjects.push(message));

                    return promise;
                }

                const promise = this.respond(args[0], {
                    channel: message.channel
                });

                this.ignoredObjects.push(promise);
                promise.then(message => this.ignoredObjects.push(message));

                return promise;
            },

            // Bot and plugin related stuff
            bot: this.bot,
            commander: this.bot.commander,
            fmt: this.bot.fmt,
            db: this.bot.db,

            // Client stuff
            client: this.bot.client,
            guilds: this.bot.client.guilds,
            channels: this.bot.client.channels,
            users: this.bot.client.users,
            // members: this.bot.client.members,

            // Context related stuff
            message: message,
            channel: message.channel,
            member: message.member,
            author: message.author,
            user: message.author,
            guild: message.guild,

            // Discord.js structures
            Attachment: MessageAttachment,
            MessageAttachment: MessageAttachment,
            Embed: MessageEmbed,
            MessageEmbed: MessageEmbed,

            // Module stuff
            got: require('got'),

            // For detecting command file evals
            module: {
                exports: null
            }
        };
    }

    async evaluate(code, context) {
        this.beforeEval(context);

        const require = this.require.bind(this, context.message.channel);
        swallow(require);

        let result;
        try {
            result = await eval(code);
        } catch(e) {
            result = new Error('');
            result.inner = e;
        }

        this.afterEval(context);

        return result;
    }

    sendExpand(channel, string, lang) {
        const codeBlock = lang === undefined
            ? string
            : this.bot.fmt.codeBlock(lang, string);

        if (codeBlock.length >= 2000) {
            return channel.send({
                files: [
                    new MessageAttachment(
                        Buffer.from(string, 'utf8'),
                        `eval.${lang || 'txt'}`
                    )
                ]
            });
        } else {
            return channel.send(codeBlock);
        }
    }

    async respond(result, context) {
        const { channel } = context;

        if (result === null) {
            return await channel.send('null');
        }

        if (Number.isNaN(result)) {
            return await channel.send('NaN');
        }

        if (this.ignoredObjects.includes(result)) {
            return;
        }

        if (typeof result === 'bigint') {
            return await this.sendExpand(channel, `${result}n`);
        }

        if (['string', 'symbol', 'number', 'undefined'].includes(typeof result)) {
            return await this.sendExpand(channel, String(result));
        }

		if (typeof result === 'function') {
			const stringified = result.toString();
			const lastLine = stringified.slice(stringified.lastIndexOf('\n') + 1);
			const indent = lastLine.match(/^\s*/)[0];
            let indented = indent + stringified;

            if (indented.split('\n').every(line => line.trim() === '' || line.slice(0, indent.length) === indent)) {
                indented = indented.split('\n')
                    .map(line => line.slice(indent.length))
                    .join('\n');
            }

            return await this.sendExpand(channel, indented, 'js');
		}

        if (result instanceof Error) {
            const inspection = this.inspect(result);

            return await this.sendExpand(channel, inspection, 'apache');
        }

        if (result instanceof Date) {
            return await channel.send(result.toUTCString());
        }

        if (result instanceof MessageEmbed) {
            return await channel.send(result);
        }

        if (typeof result === 'object') {
            const inspection = this.inspect(result);

            return await this.sendExpand(channel, inspection, 'js');
        }
    }

    async call(message, content) {
        const code = this.getCode(content);
        const context = this.getVars(message);
        const result = await this.evaluate(code, context);

        if (result && result instanceof Error && result.inner) {
            await message.channel.send(
                this.bot.fmt.codeBlock('apache', `${result.inner}`)
            );
        } else {
            await this.respond(result, context);
        }

        const exported = context.module.exports;

        if (Command.isPrototypeOf(exported)) {
            this.bot.commander.loadCommand(exported, exported.name);

            await message.channel.send(`Registered a new command: ${exported.name}`);
        }
    }
}

module.exports = EvalCommand;
