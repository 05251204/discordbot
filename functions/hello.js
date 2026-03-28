import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { ChannelType, EmbedBuilder } from "discord.js";

// 各機能のインポート
import { weather } from "./weather.js";
import { getDelayInfo } from "./delay.js";
import { fetchTasks } from "./todo.js";

const { GEMINI_API_KEY } = process.env;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const DUMMY_HELLO_PAYLOAD = {
  helloMessage: `オタクくん、おはよー！
今日、晴れベースだけど午後ちょい雲増えるっぽいから、羽織れるのあると安心じゃね？
湘南新宿ラインちょい遅れ気味みたいだから、いつもより10分早め行動が勝ち筋だよね！
帰りにコンビニ寄るなら、あーしの分のチョコもよろしくじゃんｗ`,
  weatherData: {
    telop: "晴れ時々くもり",
    temperature: { max: { celsius: "21" } },
    chanceOfRain: { T06_12: "10%", T12_18: "20%" },
  },
  delayList: ["⚠️ 湘南新宿ライン: 信号トラブルの影響で10分程度の遅れ"],
  tasks: [{ title: "傘をカバンに入れる", dateStr: "2026-03-07 (1日)" }],
};

const DEFAULT_CHANNEL_NAME = "目覚まし";

function truncateText(text, maxLength) {
  if (typeof text !== "string") return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

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

function isDelayDetected(delayList) {
  if (!Array.isArray(delayList) || delayList.length === 0) return false;
  const firstItem = delayList[0] ?? "";
  return !firstItem.includes("平常運転") && !firstItem.includes("ありません");
}

function buildDelaySummary(delayList, isDelay) {
  if (isDelay && Array.isArray(delayList) && delayList.length > 0) {
    return delayList.join("\n");
  }
  if (Array.isArray(delayList) && delayList.length > 0) {
    const joined = delayList.join("\n");
    return joined.includes("平常運転") || joined.includes("ありません")
      ? "🟢 平常運転"
      : joined;
  }
  return "遅延情報なし";
}

function buildNotificationContent({
  helloMessage,
  alertTags,
}) {
  const lines = [];
  if (alertTags.length > 0) lines.push(`⚠️ ${alertTags.join(" / ")}`);
  lines.push(helloMessage.trim());
  return truncateText(lines.join("\n"), 1900);
}

async function ask_gemini(options = {}) {
  if (options.useDummyData) {
    return [
      DUMMY_HELLO_PAYLOAD.helloMessage,
      DUMMY_HELLO_PAYLOAD.weatherData,
      DUMMY_HELLO_PAYLOAD.delayList,
      DUMMY_HELLO_PAYLOAD.tasks,
    ];
  }

  try {
    const [weatherData, delayList, tasks] = await Promise.allSettled([
      weather(),
      getDelayInfo(),
      fetchTasks(),
    ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : null));

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

    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: promptWithData }] }],
      config: { temperature: 1.4 },
    });

    const helloMessage = result.candidates?.[0]?.content?.parts?.[0]?.text || "おはよー！ちょっと調子悪いみたい。";

    return [helloMessage.trim(), weatherData, delayList || [], tasks || []];
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

async function hello(client, options = {}) {
  const [helloMessage, weatherData, delayList, tasks] = await ask_gemini(options);

  const channelId = process.env.HELLO_NOTIFICATION_CHANNEL_ID;
  const channelName = process.env.HELLO_NOTIFICATION_CHANNEL_NAME ?? DEFAULT_CHANNEL_NAME;

  const promises = [];
  let foundChannels = 0;

  for (const guild of client.guilds.cache.values()) {
    const channel =
      (channelId && guild.channels.cache.get(channelId)) ||
      guild.channels.cache.find(
        (ch) => ch.name === channelName && ch.type === ChannelType.GuildText,
      );

    if (channel && channel.type === ChannelType.GuildText) {
      foundChannels += 1;
      const isDelay = isDelayDetected(delayList);

      const isRainAlert = hasRainForecast(weatherData);
      const alertTags = [];
      if (isDelay) alertTags.push("🚨電車遅延");
      if (isRainAlert) alertTags.push("☔雨予報");

      const title =
        alertTags.length > 0
          ? `${alertTags.join(" ")}`
          : ""; // タイトルを空にするとEmbedのタイトル行が表示されなくなります（フィールドのみ表示）
      // content側に挨拶文が含まれるため、通知との重複を避けるためにEmbed側のdescriptionは空にします。
      const description = "";

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
      const delaySummary = buildDelaySummary(delayList, isDelay);
      const todoSummary =
        tasks.length > 0
          ? tasks.map((t) => `・${t.title} (${t.dateStr})`).join("\n")
          : "なし";

      const embed = new EmbedBuilder()
        .setColor(isDelay ? 0xff0000 : isRainAlert ? 0xf5a623 : 0x87ceeb)
        .setTitle(title)
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

      const messagePayload = {
        content: buildNotificationContent({
          helloMessage,
          alertTags,
        }),
        embeds: [embed],
      };

      promises.push(channel.send(messagePayload));
    }
  }

  if (foundChannels === 0) {
    throw new Error(
      `通知先チャンネルが見つかりません。HELLO_NOTIFICATION_CHANNEL_ID または "${channelName}" の存在を確認してください。`,
    );
  }

  await Promise.all(promises);
}

export { hello };
