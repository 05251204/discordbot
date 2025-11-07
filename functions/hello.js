import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { ChannelType } from "discord.js";
import { weather } from "./weather.js";
const { GEMINI_API_KEY } = process.env;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function ask_gemini() {
  try {
    const contextResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents:
        "親しみやすい二次元の女性の属性を十文字程度で一つ挙げてください（例：世話焼きな幼馴染、元気な後輩など）。その際、「了解しました。」などの文は一切出力せず、属性のみ出力してください。",
      config: {
        temperature: 1.0,
      },
    });
    const contextText = contextResult.text.trim();

    const weatherData = await weather();

    const helloResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
あなたは「${contextText}」という設定のキャラクターです。
友人を優しく起こしに来ました。

以下の天気情報を簡潔に盛り込みつつ、朝の挨拶と起こすセリフを二、三文で作成してください。

# 天気情報
- 場所: 大岡山
- 天気: ${weatherData.detail.weather}
- 最高気温: ${weatherData.temperature.max.celsius}℃
- 降水確率: 午前六時～十二時${weatherData.chanceOfRain.T06_12},午前十二時～十八時${weatherData.chanceOfRain.T12_18}

# 指示
- 「了解しました。」等の前置きは一切不要です。
- セリフのみを出力してください（地の文は不要です）。
- 相手の名前（〇〇君など）は呼ばないでください。
`,
      config: {
        temperature: 2.0,
      },
    });
    const helloText = helloResult.text.trim();

    //console.log("属性:", contextText);
    //console.log("セリフ:", helloText);

    return [contextText, helloText];
  } catch (error) {
    //console.error("Gemini APIの呼び出し中にエラーが発生しました:", error);
    return ["エラー", "AIの呼び出し中に問題が発生しました。"];
  }
}

async function hello(client) {
  const [context, helloMessage] = await ask_gemini();

  client.guilds.cache.forEach((guild) => {
    const channel = guild.channels.cache.find(
      (ch) => ch.name === "目覚まし" && ch.type === ChannelType.GuildText
    );

    if (channel) {
      channel.send("今日の美少女：", context);
      channel.send("----------");
      channel.send(helloMessage);
    }
  });
}

export { hello };
