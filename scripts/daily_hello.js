import "dotenv/config";
import { Client, GatewayIntentBits, Events } from "discord.js";
import { hello } from "../functions/hello.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const useDummyData = process.env.HELLO_USE_DUMMY_DATA === "true";

client.once(Events.ClientReady, async (c) => {
  console.log(`${c.user.tag} has logged in for the daily task.`);
  try {
    await hello(client, { useDummyData });
    console.log("Daily hello message sent successfully.");
  } catch (error) {
    console.error("An error occurred during the daily hello task:", error);
    process.exitCode = 1;
  } finally {
    client.destroy();
    console.log("Client destroyed.");
  }
});

client.login(process.env.TOKEN).catch(err => {
  console.error("Login failed:", err);
  process.exit(1);
});
