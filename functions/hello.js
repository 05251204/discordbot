import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { ChannelType, EmbedBuilder } from "discord.js";

// 各機能のインポート
import { weather } from "./weather.js";
import { getDelayInfo } from "./delay.js";
import { fetchTasks } from "./todo.js";

const { GEMINI_API_KEY } = process.env;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

function toPercentNumber(value) {
  if (typeof value !== "string") return 0;
  const matched = value.match(/\d+/);
  return matched ? Number(matched[0]) : 0;
}

function hasRainForecast(weatherData) {
  if (!weatherData || typeof weatherData !== "object") return false;
  const morning = toPercentNumber(weatherData.chanceOfRain?.T06_12);
  const afternoon = toPercentNumber(weatherData.chanceOfRain?.T12_18);
  return morning > 0 || afternoon > 0;
}

function getJstWeekday() {
  return new Intl.DateTimeFormat("ja-JP", {
    weekday: "long",
    timeZone: "Asia/Tokyo",
  }).format(new Date());
}

function buildPromptWeather(weatherData) {
  if (!weatherData || typeof weatherData !== "object") return "取得失敗";
  const telop = weatherData.telop || "不明";
  const maxTemp = weatherData.temperature?.max?.celsius ?? "--";
  const rainMorning = weatherData.chanceOfRain?.T06_12 ?? "--";
  const rainAfternoon = weatherData.chanceOfRain?.T12_18 ?? "--";
  return `${telop} / 最高${maxTemp}℃ / 降水:午前${rainMorning}・午後${rainAfternoon}`;
}

async function ask_gemini() {
  try {
    const [weatherData, delayList, tasks] = await Promise.all([
      weather(),
      getDelayInfo(),
      fetchTasks(),
    ]);

    const prompt = `
あなたは、クラスで私の隣の席に座っている女子高生（ギャル）として振る舞ってください。

■キャラクター設定
・一人称：あーし
・二人称：オタクくん
・性格：明るくハイテンションで、オタクくんを特別に気にかけている「オタクに優しいギャル」です。
・関係性：毎日隣の席で、趣味の話や体調の話を親身に聞き合えるほど心の距離が近い同級生。

■入力情報（プログラムから動的に挿入されます）
・今日の天気：{weather}
・今日の曜日：{day_of_the_week}

■口調のルール
・語尾に「～じゃね？」「～だよね」「～じゃんｗ」「～すぎ！」など、フランクで温かいギャル語を使ってください。
・「オタクくん、おはよー！」という第一声から始めてください。

■話題と内容の指示
・提供された「天気」と「曜日」の情報をセリフの中に自然に盛り込んでください。
・学校の事務的な話（授業や先生の話）は避け、オタクくんの趣味や昨夜の過ごし方、体調を気遣う内容をメインにしてください。

■出力の厳格な制約
・出力は「キャラクターのセリフのみ」としてください。
・セリフの後に「次は～について話しましょうか？」といった、会話を誘導するメタ的な発言や解説は絶対に含めないでください。
・出力の分量は、4行から5行程度にしてください。
`;

    const promptWithData = prompt
      .replace("{weather}", buildPromptWeather(weatherData))
      .replace("{day_of_the_week}", getJstWeekday());

    const helloResult = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: promptWithData,
      config: { temperature: 1.4 },
    });

    let helloMessage = helloResult.response
      ? helloResult.response.text()
      : helloResult.text;

    return [helloMessage.trim(), weatherData, delayList, tasks];
  } catch (error) {
    console.error("Gemini API Error:", error);
    return [
      "おーい、起きてー！…あ、ごめん、今ちょっと頭がぼーっとしちゃった。自分で天気見てくれる？",
      null,
      [],
      [],
    ];
  }
}

async function hello(client) {
  const [helloMessage, weatherData, delayList, tasks] = await ask_gemini();

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

      const isRainAlert = hasRainForecast(weatherData);
      const alertTags = [];
      if (isDelay) alertTags.push("🚨電車遅延");
      if (isRainAlert) alertTags.push("☔雨予報");

      const title =
        alertTags.length > 0
          ? `${alertTags.join(" ")} 今日の朝メモ`
          : "今日の朝メモ";
      const description =
        alertTags.length > 0
          ? `【${alertTags.join("・")}】\n${helloMessage}`
          : helloMessage;

      const weatherTelop =
        weatherData && typeof weatherData === "object" && weatherData.telop
          ? weatherData.telop
          : "取得失敗";
      const maxTemp =
        weatherData &&
        typeof weatherData === "object" &&
        weatherData.temperature?.max?.celsius
          ? `${weatherData.temperature.max.celsius}℃`
          : "--";
      const rainMorning =
        weatherData &&
        typeof weatherData === "object" &&
        weatherData.chanceOfRain?.T06_12
          ? weatherData.chanceOfRain.T06_12
          : "--";
      const rainAfternoon =
        weatherData &&
        typeof weatherData === "object" &&
        weatherData.chanceOfRain?.T12_18
          ? weatherData.chanceOfRain.T12_18
          : "--";

      const weatherSummary = `${weatherTelop} (${maxTemp})\n☂️ 午前${rainMorning} / 午後${rainAfternoon}`;
      const delaySummary = isDelay ? delayList.join("\n") : "🟢 平常運転";
      const todoSummary =
        tasks.length > 0
          ? tasks.map((t) => `・${t.title} (${t.dateStr})`).join("\n")
          : "なし";

      const embed = new EmbedBuilder()
        .setColor(isDelay ? 0xff0000 : isRainAlert ? 0xf5a623 : 0x87ceeb)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

      embed.addFields(
        {
          name: isRainAlert ? "☔ 天気（雨注意）" : "📍 天気",
          value:
            weatherSummary.length > 1024
              ? weatherSummary.substring(0, 1021) + "..."
              : weatherSummary,
          inline: true,
        },
        {
          name: isDelay ? "🚨 運行情報（遅延）" : "🚃 運行情報",
          value:
            delaySummary.length > 1024
              ? delaySummary.substring(0, 1021) + "..."
              : delaySummary,
          inline: true,
        },
        {
          name: "📋 タスク",
          value:
            todoSummary.length > 1024
              ? todoSummary.substring(0, 1021) + "..."
              : todoSummary,
          inline: false,
        },
      );

      const messagePayload =
        alertTags.length > 0
          ? { content: `⚠️ ${alertTags.join(" / ")}`, embeds: [embed] }
          : { embeds: [embed] };

      promises.push(channel.send(messagePayload));
    }
  }
  await Promise.all(promises);
}

export { hello };
