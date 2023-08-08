const { joinVoiceChannel, getVoiceConnection, createAudioPlayer, NoSubscriberBehavior } = require('@discordjs/voice');

const Plugin = require('../../structs/Plugin');

class MusicPlugin extends Plugin {
    load() {
        this.bot.music = new Music(this.bot);
    }
}

class Music {
    constructor(bot) {
        Object.defineProperty(this, 'bot', { value: bot });

        // this.connections = {};
    }

    join(voiceChannel) {
        const existingConnection = getVoiceConnection(voiceChannel.guild.id);
        if (existingConnection && existingConnection.joinConfig.channelId === voiceChannel.id) {
            return existingConnection;
        }

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator
        });

        // this.connections[voiceChannel.guild.id] = connection;

        return connection;
    }

    play(voiceChannel, link) {
        const connection = this.join(voiceChannel);

    }
}

module.exports = MusicPlugin;
