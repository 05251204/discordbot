import "dotenv/config";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { mangaRelease } from "../functions/manga_release.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const useDummyData = process.env.MANGA_USE_DUMMY_DATA === "true";

client.once(Events.ClientReady, async (c) => {
  console.log(`${c.user.tag} has logged in for the manga release task.`);
  try {
    const addedItems = await mangaRelease(client, { useDummyData });
    console.log(
      `Manga release task completed. Added ${addedItems.length} item(s).`,
    );
  } catch (error) {
    console.error("An error occurred during manga release task:", error);
    process.exit(1);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(process.env.TOKEN);
