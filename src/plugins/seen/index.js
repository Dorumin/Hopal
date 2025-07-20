const Plugin = require('../../structs/Plugin');
const SQLPlugin = require('../sql');

class SeenPlugin extends Plugin {
    static get deps() {
        return [
            SQLPlugin
        ];
    }

    load() {
        this.bot.seen = new Seen(this.bot);
    }
}

class Seen {
    constructor(bot) {
        this.bot = bot;
        this.config = bot.config.SEEN || {};

        this.sql = this.bot.sql.handle('starboard');
        this.sql.exec(`CREATE TABLE IF NOT EXISTS seen_v0 (
            user_id INTEGER PRIMARY KEY,
            last_online INTEGER NOT NULL DEFAULT 0,
            last_action INTEGER NOT NULL DEFAULT 0
        )`);

        this.sql.getSeen = this.sql.prepare(`
            SELECT *
            FROM seen_v0
            WHERE
                user_id = ?
        `).safeIntegers(true);
        this.sql.setLastOnline = this.sql.prepare(`
            INSERT INTO seen_v0 (
                user_id,
                last_online
            )
            VALUES (
                ?,
                ?
            )
            ON CONFLICT(user_id) DO UPDATE SET
                last_online = MAX(excluded.last_online, seen_v0.last_online)
        `);
        this.sql.setLastAction = this.sql.prepare(`
            INSERT INTO seen_v0 (
                user_id,
                last_action
            )
            VALUES (
                ?,
                ?
            )
            ON CONFLICT(user_id) DO UPDATE SET
                last_action = MAX(excluded.last_action, seen_v0.last_action)
        `);

        bot.client.on('presenceUpdate', this.onPresenceUpdate.bind(this));
        bot.client.on('typingStart', this.onTypingStart.bind(this));
        bot.client.on('message', this.onMessage.bind(this));
    }

    async getTimes(userId) {
        const result = await this.sql.getSeen.get(userId);

        return {
            lastOnline: result.last_online === 0n ? null : new Date(Number(result.last_online)),
            lastAction: result.last_action === 0n ? null : new Date(Number(result.last_action))
        };
    }

    async updateOnline(userId, timestamp) {
        await this.sql.setLastOnline.run(userId, timestamp);
    }

    async updateAction(userId, timestamp) {
        await this.sql.setLastAction.run(userId, timestamp);
    }

    async onPresenceUpdate(oldP, newP) {
        if (!oldP) return;

        // Active states are "dnd" and "online", inactive states are "idle" and "offline"
        // Setting the last online field is when it transitions from active to inactive
        // Clippy could simplify this boolean logic, but I don't care at this point
        if (
            !(
                (oldP.status === 'online' || oldP.status === 'dnd') &&
                (newP.status === 'offline' || newP.status === 'idle')
            )
        ) return;

        const member = newP.member;
        if (!member) return;

        console.log(`${member.user.username}: ${oldP.status} -> ${newP.status}`);

        this.updateOnline(member.id, Date.now());
    }

    async onTypingStart(typing) {
        const member = typing.member;
        if (!member) return;

        this.updateAction(member.id, Date.now());
    }

    async onMessage(message) {
        const author = message.author;
        if (!author) return;

        this.updateAction(author.id, Date.now());
    }
}

module.exports = SeenPlugin;
