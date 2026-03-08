import assert from "node:assert/strict";
import { ChannelType } from "discord.js";
import { mangaRelease } from "../functions/manga_release.js";

const sentPayloads = [];

const mockChannel = {
  id: "manga-test-channel",
  name: "目覚まし",
  type: ChannelType.GuildText,
  async send(payload) {
    sentPayloads.push(payload);
    return payload;
  },
};

const mockGuild = {
  channels: {
    cache: {
      get: (id) => (id === mockChannel.id ? mockChannel : undefined),
      find: (predicate) => (predicate(mockChannel) ? mockChannel : undefined),
    },
  },
};

const mockClient = {
  guilds: {
    cache: new Map([["test-guild", mockGuild]]),
  },
};

const addedItems = await mangaRelease(mockClient, { useDummyData: true });

assert.equal(addedItems.length, 1, "追加対象の件数が想定と異なります");
assert.equal(sentPayloads.length, 1, "Discord通知送信件数が不正です");
assert.ok(
  sentPayloads[0].content.includes("買い物リスト"),
  "通知本文に買い物リスト追加メッセージがありません",
);
assert.equal(
  sentPayloads[0].embeds[0].data.title,
  "📚 漫画の新刊を買い物リストに追加しました",
  "通知タイトルが不正です",
);

sentPayloads.length = 0;
const noItems = await mangaRelease(mockClient, {
  useDummyData: true,
  dummyItems: [],
});
assert.equal(noItems.length, 0, "0件ケースの追加結果が不正です");
assert.equal(sentPayloads.length, 1, "0件ケースで通知が送られていません");
assert.ok(
  sentPayloads[0].content.includes("0件"),
  "0件ケースの通知本文が不正です",
);
assert.equal(
  sentPayloads[0].embeds[0].data.title,
  "📚 漫画の新刊チェック結果",
  "0件ケースの通知タイトルが不正です",
);

console.log("Manga release notification dummy test passed.");
