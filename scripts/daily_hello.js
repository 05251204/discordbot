import "dotenv/config";
import { Client, GatewayIntentBits, Events } from "discord.js";
import { hello } from "../functions/hello.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (c) => {
  console.log(`${c.user.tag} has logged in for the daily task.`);
  try {
    await hello(client);
    console.log("Daily hello message sent successfully.");
  } catch (error) {
    console.error("An error occurred during the daily hello task:", error);
    process.exit(1);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(process.env.TOKEN);
