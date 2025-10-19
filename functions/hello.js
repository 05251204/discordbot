const { ChannelType } = require("discord.js");

function hello(client) {
  client.guilds.cache.forEach((guild) => {
    const channel = guild.channels.cache.find(
      (ch) => ch.name === "目覚まし" && ch.type === ChannelType.GuildText
    );

    if (channel) {
      channel.send("おはようございます！☀️");
    }
  });
}

// hello関数を外部から使えるようにエクスポート
module.exports = { hello };
