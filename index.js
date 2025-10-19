require("dotenv").config();
const cron = require("node-cron");
const fs = require("node:fs");
const path = require("node:path");
const { Client, Collection, Events, GatewayIntentBits } = require("discord.js");
const TOKEN = process.env.TOKEN;
const { hello } = require("./functions/hello.js");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// コマンドハンドリングのセットアップ
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(
      `[警告] ${filePath} のコマンドには、必須の "data" または "execute" プロパティがありません。`
    );
  }
}

// Bot起動時の処理
client.once(Events.ClientReady, (c) => {
  console.log(`${c.user.tag}がログインしました。`);
});

// スラッシュコマンド実行時の処理
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    console.error(
      `${interaction.commandName}というコマンドには対応していません。`
    );
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "コマンド実行時にエラーが発生しました。",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "コマンド実行時にエラーが発生しました。",
        ephemeral: true,
      });
    }
  }
});

// 毎朝9時に行われる処理
cron.schedule(
  "0 9 * * *",
  () => {
    // hello関数にclientオブジェクトを渡して実行
    hello(client);
  },
  {
    timezone: "Asia/Tokyo",
  }
);

client.login(TOKEN);
