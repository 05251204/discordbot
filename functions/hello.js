import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { ChannelType } from "discord.js";
//import { weather } from "weather.js";
const { GEMINI_API_KEY } = process.env;

const ai = new GoogleGenAI(GEMINI_API_KEY);


async function ask_gemini() {
  try {
    const contextResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents:
        "良い感じの二次元の女性の属性を一つ挙げてください。その際、「了解しました。」などの文は一切出力せず、属性のみ出力してください。",
      config:{
        temperature:0.5
      }
    });
    const contextText = contextResult.text;

    //const weatherData = await weather.weather();

    const helloResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `あなたは${contextText}で、友人を起こしに来ています。適切な文を一、二文ほど出力してください。その際、「了解しました。」等の文は一切出力せず、いきなり本文から初めてください。また、地の文は挿入せずセリフのみで構成してください。〇〇君、のような形でこちらの名前を出さないでください。`,
    });
    const helloText = helloResult.text;
    console.log( contextText, helloText);
    return [contextText, helloText];
  } catch (error) {
    console.error("Gemini APIの呼び出し中にエラーが発生しました:", error);
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
      channel.send("今日の美少女：",context);
      channel.send("----------");
      channel.send(helloMessage);
    }
  });
}

ask_gemini();

export { hello };
