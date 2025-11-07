import "dotenv/config";
import cron from "node-cron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client, Collection, Events, GatewayIntentBits } from "discord.js";

import { hello } from "./functions/hello.js";
const token = process.env.TOKEN;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// コマンドハンドリングのセットアップ
client.commands = new Collection();
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = await import(pathToFileURL(filePath).href);

  if ("data" in command.default && "execute" in command.default) {
    client.commands.set(command.default.data.name, command.default);
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

cron.schedule(
  "0 7 * * *",
  () => {
    hello(client);
  },
  {
    timezone: "Asia/Tokyo",
  }
);

client.login(token);
