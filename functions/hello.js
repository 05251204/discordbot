import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { ChannelType, EmbedBuilder } from "discord.js";

// 各機能のインポート
import { weather } from "./weather.js";
import { getDelayInfo } from "./delay.js";
import { fetchFormattedTasks } from "./todo.js";

const { GEMINI_API_KEY } = process.env;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function ask_gemini() {
  try {
    // 1. キャラクター属性の決定
    // 少しひねった属性が出やすいようにtemperatureを高めに設定
    const contextResult = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: "親しみやすい二次元の女性の属性を十文字程度で一つ挙げてください（例：世話焼きな幼馴染、高飛車なツンデレお嬢様、常に眠そうなダウナー系、ミステリアスな先輩など）。「了解しました」等の前置きは不要で、属性名のみを出力してください。",
      config: { temperature: 1.8 },
    });

    let contextText = contextResult.response ? contextResult.response.text() : contextResult.text;
    const attribute = contextText ? contextText.trim() : "世話焼きな幼馴染";

    // 2. 情報収集
    console.log(`[${attribute}] として情報を収集中...`);
    const [weatherData, delayList, todoText] = await Promise.all([
        weather(),
        getDelayInfo(),
        fetchFormattedTasks()
    ]);

    // 遅延情報のテキスト化
    const isDelay = delayList.length > 0;
    const delayText = isDelay ? delayList.join("\n") : "現在、通学路線の遅延情報はありません（平常運転）。";

    // 天気情報のテキスト化
    const weatherInfoText = `
- 天気: ${weatherData.detail.weather}
- 最高気温: ${weatherData.temperature.max.celsius}℃
- 降水確率: 午前${weatherData.chanceOfRain.T06_12}% / 午後${weatherData.chanceOfRain.T12_18}%
`;

    // 3. プロンプト作成
    // ここが肝です。「明るく」ではなく「キャラらしく」振る舞うよう指示します。
    const prompt = `
あなたは「${attribute}」という設定のキャラクターになりきってください。
朝、友人の部屋に入ってきて、友人を起こしに来たシチュエーションです。

以下の「今日の状況」を踏まえ、**そのキャラクターの性格を100%反映した**挨拶とセリフを作成してください。

# 今日の状況データ
## 1. 天気
${weatherInfoText}

## 2. 電車の運行状況
${delayText}

## 3. 今週のタスク（未完了）
${todoText}

# 演技のガイドライン（最重要）
1. **性格の徹底**: 
   - 無理に明るく振る舞う必要はありません。
   - ツンデレなら素っ気なく、ダウナーなら気怠げに、ヤンデレなら重く、**その属性ならこの状況にどう反応するか**を第一に考えてください。
   
2. **情報の優先度**:
   - **悪いニュース（遅延、雨、期限切れタスク）**がある場合は、それを最優先で指摘してください。それが友人のためだからです。
   - **特に何もない平和な日**の場合: 「今日は何もなくて平和だ」という事実を、あなたの性格なりの言葉で伝えてください。（無理にテンションを上げなくて良いです）

3. **禁止事項**:
   - アナウンサーのような無機質な読み上げ（「天気は晴れです」など）。
   - 「了解しました」などのシステム出力。
   - 自分の名前を名乗ること。

4. **構成**:
   - 3〜4文程度。
   - 起こす言葉 → 状況へのコメント（性格が出る部分） → 締めの言葉。

それでは、お願いします。
`;

    const helloResult = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: { temperature: 1.4 }, // 創造性を高めて演技させる
    });

    let helloText = helloResult.response ? helloResult.response.text() : helloResult.text;

    if (!helloText) {
       return [attribute, "……起きて。（生成失敗）", weatherData, delayList];
    }

    return [attribute, helloText.trim(), weatherData, delayList];

  } catch (error) {
    console.error("Gemini API Error:", error);
    return ["通信エラー", "なんか通信エラーみたい。もう一回寝たら直るかもよ？", null, []];
  }
}

async function hello(client) {
  const [context, helloMessage, weatherData, delayList] = await ask_gemini();

  const promises = [];
  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.find(
      (ch) => ch.name === "目覚まし" && ch.type === ChannelType.GuildText
    );

    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(0xffb6c1) 
        .setTitle(`今日の担当：${context}`)
        .setDescription(helloMessage)
        .setTimestamp();
      
      // 天気フィールド（アイコン化してコンパクトに）
      if (weatherData && weatherData.detail) {
        embed.addFields(
            { name: '📍 今日の天気', value: `${weatherData.telop} / ${weatherData.temperature.max.celsius}℃`, inline: true }
        );
      }

      // 遅延情報フィールド
      // 遅延があるときは赤色の警告アイコン、ないときは緑色のチェックなど
      const isDelay = delayList.length > 0 && !delayList[0].includes("ありません");
      
      if (isDelay) {
         embed.setColor(0xff0000); // 遅延時はEmbedを赤くする
         embed.addFields(
            { name: '🚨 運行情報', value: delayList.join('\n'), inline: false }
         );
      } else {
         // 平常時は控えめに表示
         embed.addFields(
            { name: '🚃 運行情報', value: '🟢 平常運転', inline: true }
         );
      }

      promises.push(channel.send({ embeds: [embed] }));
    }
  }
  await Promise.all(promises);
}

export { hello };