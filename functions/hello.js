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
    const contextResult = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents:
        "親しみやすい二次元の女性の属性を一つ挙げてください（例：世話焼きな幼馴染、高飛車なツンデレお嬢様、常に眠そうなダウナー系、元気いっぱいの後輩、おっとりした年上の近所のお姉さんなど）。属性名のみを出力してください。",
      config: { temperature: 1.8 },
    });

    let contextText = contextResult.response
      ? contextResult.response.text()
      : contextResult.text;
    const attribute = contextText ? contextText.trim() : "世話焼きな幼馴染";

    // 2. 情報収集
    const [weatherData, delayList, todoText] = await Promise.all([
      weather(),
      getDelayInfo(),
      fetchFormattedTasks(),
    ]);

    const isDelay = delayList.length > 0 && !delayList[0].includes("平常運転");
    const delayInfoForAI = isDelay
      ? delayList.join("\n")
      : "平常運転（問題なし）";

    // 3. プロンプト作成（行動描写を廃止し、セリフの質感に特化）
    const prompt = `
あなたは「${attribute}」という設定のキャラクターです。
朝、まだ寝ている友人の部屋に入ってきて、あなたらしい言い方で起こすシーンのセリフを作成してください。

### あなたが把握している状況（友人はまだ知りません）
【今日の天気】
- 概況: ${weatherData.detail?.weather}
- 気温: 最高${weatherData.temperature?.max?.celsius}度
- 降水確率: 午前${weatherData.chanceOfRain?.T06_12}% / 午後${weatherData.chanceOfRain?.T12_18}%

【電車の状況】
${delayInfoForAI}

【タスク（Notionより）】
${todoText}

### セリフ作成の指示
1. **「状況」をキャラクターの「感想」や「助言」に変換してください**:
   - 数値を機械的に読み上げるのは厳禁です。
   - キャラクターの性格に合わせて、「今日は冷えるから厚着してね」「雨が降りそうだから傘忘れないで」のように、友人を気遣ったり、急かしたりする自然な言葉に変えてください。
   - 電車の遅延があるなら、具体的にどの路線が大変そうか、あなたの性格らしい反応（心配、からかい、呆れなど）を交えて教えてください。
   
2. **タスクの扱い**:
   - Notionの情報をそのまま読み上げるのではなく、期限が近いものや山積みのタスクに対して、「今日が締め切りのやつあるよ！」「まだ終わってないのあるでしょ？」と、あなたのフィルターを通して指摘してください。

3. **純粋なセリフのみを出力**:
   - (カーテンを開ける) などの動作描写は一切含めないでください。言葉だけでその場の空気感を表現してください。
   - 「了解しました」などの前置き、自分の名前、相手の名前の呼びかけは禁止です。

4. **構成**:
   - 長さは3〜5文程度。
   - 起こす言葉 → 状況を踏まえた助言や小言 → 締めの言葉。

それでは、${attribute}としておはようの挨拶をお願いします。
`;

    const helloResult = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
      config: { temperature: 1.4 },
    });

    let helloMessage = helloResult.response
      ? helloResult.response.text()
      : helloResult.text;

    return [attribute, helloMessage.trim(), weatherData, delayList];
  } catch (error) {
    console.error("Gemini API Error:", error);
    return [
      "通信エラー",
      "おーい、起きてー！…あ、ごめん、今ちょっと頭がぼーっとしちゃった。自分で天気見てくれる？",
      null,
      [],
    ];
  }
}

async function hello(client) {
  const [context, helloMessage, weatherData, delayList] = await ask_gemini();

  const promises = [];
  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.find(
      (ch) => ch.name === "目覚まし" && ch.type === ChannelType.GuildText,
    );

    if (channel) {
      const isDelay =
        delayList.length > 0 &&
        !delayList[0].includes("平常運転") &&
        !delayList[0].includes("ありません");

      const embed = new EmbedBuilder()
        .setColor(isDelay ? 0xff0000 : 0x87ceeb) // 遅延時は赤、平常時は空色
        .setTitle(`今日の担当：${context}`)
        .setDescription(helloMessage)
        .setTimestamp();

      if (weatherData && weatherData.detail) {
        embed.addFields(
          {
            name: "📍 天気",
            value: `${weatherData.telop} (${weatherData.temperature.max.celsius}℃)`,
            inline: true,
          },
          {
            name: isDelay ? "🚨 運行情報" : "🚃 運行情報",
            value: isDelay ? delayList.join("\n") : "🟢 平常運転",
            inline: true,
          },
        );
      }

      promises.push(channel.send({ embeds: [embed] }));
    }
  }
  await Promise.all(promises);
}

export { hello };
