import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { ChannelType } from "discord.js";

// .envファイルからAPIキーを読み込む
const { GEMINI_API_KEY } = process.env;

// Gemini AIのセットアップ。APIキーを明示的に渡す。
const ai = new GoogleGenAI(GEMINI_API_KEY);

async function ask_gemini() {
  try {
    // 属性を生成
    const contextResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents:
        "良い感じの二次元の女性の属性を一つ挙げてください（例：金髪ツインテール美少女）。その際、「了解しました。」などの文は一切出力せず、属性のみ出力してください。",
    });
    const contextText = contextResult.text;

    // 属性に基づいた挨拶を生成
    const helloResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `あなたは${contextText}で、友人を起こしに来ています。適切な文を一、二文ほど出力してください。その際、「了解しました。」などの文は一切出力せず、いきなり本文から初めてください。また、地の文は挿入せずセリフのみで構成してください。`,
    });
    const helloText = helloResult.text;

    return [contextText, helloText];
  } catch (error) {
    console.error("Gemini APIの呼び出し中にエラーが発生しました:", error);
    return ["エラー", "AIの呼び出し中に問題が発生しました。"]; // エラー時も配列を返す
  }
}

// clientオブジェクトを引数として受け取る
async function hello(client) {
  const [context, helloMessage] = await ask_gemini();

  client.guilds.cache.forEach((guild) => {
    const channel = guild.channels.cache.find(
      (ch) => ch.name === "目覚まし" && ch.type === ChannelType.GuildText
    );

    if (channel) {
      channel.send(context);
      channel.send("----------");
      channel.send(helloMessage);
    }
  });
}

// hello関数を外部から使えるようにエクスポート
export { hello };
