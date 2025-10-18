const heyFile = require('./commands/tst.js');


const { Client, Events, GatewayIntentBits } = require('discord.js');
const { applicationId, guildId, token } = require('./config.json');
const client = new Client({ intents: [GatewayIntentBits.Guilds] });


client.once(Events.ClientReady, c => {
	console.log(`${c.user.tag}がログイン`);

  const guild = client.guilds.cache.get(guildId);
  const channel = guild.channels.cache.find(ch => ch.name === '目覚まし' && ch.isTextBased());
  if (channel) {
    channel.send('Botが起動しました！');
  }
});


client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === heyFile.data.name) {
        try {
            await heyFile.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'コマンド実行時にエラーになりました。', ephemeral: true });
            } else {
                await interaction.reply({ content: 'コマンド実行時にエラーになりました。', ephemeral: true });
            }
        }
    } else {
        console.error(`${interaction.commandName}というコマンドには対応していません。`);
    }
});


client.login(token);