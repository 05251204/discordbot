import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { ChannelType } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { weather } from "./weather.js";
const { GEMINI_API_KEY } = process.env;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function ask_gemini() {
  try {
    const contextResult = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: "親しみやすい二次元の女性の属性を十文字程度で一つ挙げてください（例：世話焼きな幼馴染、元気な後輩、クールな生徒会長など）。その際、「了解しました。」などの文は一切出力せず、属性のみ出力してください。",
      config: {
        temperature: 2.0,
      },
    });

    let contextText = typeof contextResult.text === 'function' ? contextResult.text() : contextResult.text;
    if (!contextText && contextResult.response && typeof contextResult.response.text === 'function') {
        contextText = contextResult.response.text();
    }

    if (!contextText) {
      console.error("Attribute generation failed. Result:", JSON.stringify(contextResult, null, 2));
      throw new Error("Attribute generation returned no text.");
    }
    const attribute = contextText.trim();

    const weatherData = await weather();
    const weatherInfoText = `
- 天気: ${weatherData.detail.weather}
- 最高気温: ${weatherData.temperature.max.celsius}℃
- 降水確率(午前): ${weatherData.chanceOfRain.T06_12}%
- 降水確率(午後): ${weatherData.chanceOfRain.T12_18}%
`;

    const helloResult = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: `
あなたは「${attribute}」という設定のキャラクターです。
友人の部屋に入ってきて、朝、友人をあなたらしく起こしに来ました。

以下の天気情報を盛り込みつつ、そのキャラクターらしい口調で挨拶と起こすセリフを作成してください。

# 今日の天気情報
${weatherInfoText}

# 指示
- **天気予報のように情報を読み上げないでください。**
- 天気や気温を見て、キャラクターとしての「感想」や「体感」をセリフに混ぜてください。
- 「了解しました」などの前置きは一切不要です。セリフのみを出力してください。
- こちらの名前は呼ばないでください。
- 長さは3〜4文程度でまとめてください。
`,
      config: {
        temperature: 2.0,
      },
    });

    let helloText = typeof helloResult.text === 'function' ? helloResult.text() : helloResult.text;
    if (!helloText && helloResult.response && typeof helloResult.response.text === 'function') {
        helloText = helloResult.response.text();
    }

    if (!helloText) {
       console.error("Hello message generation failed. Result:", JSON.stringify(helloResult, null, 2));
       return [attribute, "（布団にくるまって出てこないようです...）", weatherData];
    }

    return [attribute, helloText.trim(), weatherData];

  } catch (error) {
    console.error("Gemini API Error:", error);
    return ["Gemini APIエラー", "あれれ？ちょっと電波の調子が芳しくないようです。もう一回試してみることをおすすめします！", null];
  }
}

async function hello(client) {
  const [context, helloMessage, weatherData] = await ask_gemini();

  const promises = [];
  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.find(
      (ch) => ch.name === "目覚まし" && ch.type === ChannelType.GuildText
    );


    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle(`今日の美少女：${context}`)
        .setDescription(helloMessage)
        .setTimestamp();
      
      if (weatherData && weatherData.detail) {
        embed.addFields(
            { name: '📍 大岡山の天気', value: weatherData.telop || '不明', inline: true },
            { name: '🌡️ 最高気温', value: `${weatherData.temperature.max.celsius}℃`, inline: true },
            { name: '☂️ 降水確率', value: `${weatherData.chanceOfRain.T06_12} / ${weatherData.chanceOfRain.T12_18}`, inline: true }
        );
      }

      promises.push(channel.send({ embeds: [embed] }));
    }
  }
  await Promise.all(promises);
}

export { hello };
