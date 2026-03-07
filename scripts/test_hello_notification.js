import assert from "node:assert/strict";
import { ChannelType } from "discord.js";
import { hello } from "../functions/hello.js";

const sentPayloads = [];

const mockChannel = {
  name: "目覚まし",
  type: ChannelType.GuildText,
  async send(payload) {
    sentPayloads.push(payload);
    console.log("=== Mock Discord send ===");
    console.log(payload.content);
    console.log("=========================");
    return payload;
  },
};

const mockGuild = {
  channels: {
    cache: {
      find: (predicate) => (predicate(mockChannel) ? mockChannel : undefined),
    },
  },
};

const mockClient = {
  guilds: {
    cache: new Map([["test-guild", mockGuild]]),
  },
};

await hello(mockClient, { useDummyData: true });

assert.equal(sentPayloads.length, 1, "目覚ましチャンネルへの送信件数が不正です");
const payload = sentPayloads[0];
assert.ok(payload.content.includes("🌤 天気:"), "通知本文に天気がありません");
assert.ok(payload.content.includes("遅延"), "通知本文に遅延情報がありません");
assert.ok(payload.content.includes("💬 メッセージ"), "通知本文にLLMメッセージがありません");

console.log("Dummy notification payload test passed.");
