import "dotenv/config";
import axios from "axios";
import { Client as NotionClient } from "@notionhq/client";
import { ChannelType, EmbedBuilder } from "discord.js";

const DEFAULT_CHANNEL_NAME = "目覚まし";
const WATCH_ENABLED_PROPERTY_NAMES = ["有効", "enabled", "Enabled", "監視"];
const DEFAULT_RAKUTEN_ALLOWED_REFERER = "https://github.com/";
const RAKUTEN_BOOKS_SEARCH_API =
  "https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404";
const RAKUTEN_HTTP_HEADERS = {
  "User-Agent": "discordbot-release-checker/1.0 (local bot automation)",
};
const RAKUTEN_BOOKS_GENRE_ID = "001001";
const RAKUTEN_SEARCH_HITS = 30;

const DUMMY_RELEASE_ITEMS = [
  {
    watchTitle: "ワンピース",
    title: "ワンピース 第111巻",
    releaseDate: "2026-03-05",
    itemUrl: "https://ja.wikipedia.org/wiki/ONE_PIECE",
    volume: 111,
  },
];

function getNotionBookContainerId() {
  return process.env.NOTION_BOOK_ID;
}

function getNotionPurchaseContainerId() {
  return process.env.NOTION_PURCHASE_ID;
}

function getRakutenApplicationId() {
  return process.env.RAKUTEN_APPLICATION_ID;
}

function getRakutenAccessKey() {
  return process.env.RAKUTEN_ACCESS_KEY;
}

function getRakutenAllowedReferer() {
  return (
    process.env.RAKUTEN_ALLOWED_REFERER ??
    process.env.RAKUTEN_REFERER ??
    DEFAULT_RAKUTEN_ALLOWED_REFERER
  );
}

function isCompactNotionId(value) {
  return typeof value === "string" && /^[0-9a-fA-F]{32}$/.test(value);
}

function ensureRequiredEnv() {
  const missing = [];
  if (!process.env.NOTION_INTEGRATION_SECRET) {
    missing.push("NOTION_INTEGRATION_SECRET");
  }
  if (!getRakutenApplicationId()) {
    missing.push("RAKUTEN_APPLICATION_ID");
  }
  if (!getRakutenAccessKey()) {
    missing.push("RAKUTEN_ACCESS_KEY");
  }
  if (!getNotionBookContainerId()) {
    missing.push("NOTION_BOOK_ID");
  }
  if (!getNotionPurchaseContainerId()) {
    missing.push("NOTION_PURCHASE_ID");
  }
  if (missing.length > 0) {
    throw new Error(`不足している環境変数: ${missing.join(", ")}`);
  }
}

async function resolveNotionDataSourceId(notion, containerId) {
  if (isCompactNotionId(containerId)) {
    const database = await notion.databases.retrieve({
      database_id: containerId,
    });
    const linkedDataSourceId = database.data_sources?.[0]?.id;
    if (!linkedDataSourceId) {
      throw new Error(
        "指定したNotionデータベースに紐づくdata_sourceが見つかりません。",
      );
    }
    return linkedDataSourceId;
  }

  try {
    await notion.dataSources.retrieve({ data_source_id: containerId });
    return containerId;
  } catch (dataSourceError) {
    try {
      const database = await notion.databases.retrieve({
        database_id: containerId,
      });
      const linkedDataSourceId = database.data_sources?.[0]?.id;
      if (!linkedDataSourceId) {
        throw new Error(
          "指定したNotionデータベースに紐づくdata_sourceが見つかりません。",
        );
      }
      return linkedDataSourceId;
    } catch {
      throw dataSourceError;
    }
  }
}

function getJstDateString(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
  }).format(date);
}

function shiftIsoDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);
  return utcDate.toISOString().slice(0, 10);
}

function isWithinInclusiveRange(dateIso, fromIso, toIso) {
  return dateIso >= fromIso && dateIso <= toIso;
}

function normalizeText(text) {
  if (typeof text !== "string") return "";
  return text
    .toLowerCase()
    .replace(/[　\s]/g, "")
    .replace(/[・:：\-ー―~〜()（）【】\[\]/]/g, "");
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function richTextToPlain(richText = []) {
  if (!Array.isArray(richText)) return "";
  return richText
    .map((entry) => entry?.plain_text ?? "")
    .join("")
    .trim();
}

function pickPropertyNameByType(properties, expectedType, preferredNames = []) {
  for (const name of preferredNames) {
    if (properties[name]?.type === expectedType) return name;
  }
  return Object.keys(properties).find(
    (name) => properties[name]?.type === expectedType,
  );
}

function readTitleValue(page, titlePropertyName) {
  const property = page.properties?.[titlePropertyName];
  if (!property || property.type !== "title") return "";
  return richTextToPlain(property.title);
}

function readCheckboxValue(page, preferredNames = []) {
  for (const name of preferredNames) {
    const property = page.properties?.[name];
    if (property?.type === "checkbox") return property.checkbox;
  }
  return null;
}

function pickStatusOptionName(propertySchema) {
  const options =
    propertySchema?.type === "status"
      ? propertySchema.status.options
      : propertySchema?.type === "select"
        ? propertySchema.select.options
        : [];

  if (!Array.isArray(options) || options.length === 0) return null;

  const preferredNames = ["未購入", "買う", "未対応", "未処理", "To Buy"];
  for (const preferred of preferredNames) {
    const found = options.find((option) => option.name === preferred);
    if (found) return found.name;
  }
  return options[0].name;
}

async function queryDataSourceAll(notion, dataSourceId, baseParams = {}) {
  const pages = [];
  let nextCursor = undefined;

  do {
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      ...baseParams,
      ...(nextCursor ? { start_cursor: nextCursor } : {}),
    });
    pages.push(...response.results);
    nextCursor = response.has_more ? response.next_cursor : undefined;
  } while (nextCursor);

  return pages;
}

async function fetchWatchEntries(notion, watchDataSourceId) {
  const schema = await notion.dataSources.retrieve({
    data_source_id: watchDataSourceId,
  });
  const titlePropertyName = pickPropertyNameByType(schema.properties, "title", [
    "タイトル",
    "名前",
    "Title",
    "title",
  ]);

  if (!titlePropertyName) {
    throw new Error("監視DBにtitle型プロパティが見つかりません。");
  }

  const pages = await queryDataSourceAll(notion, watchDataSourceId);
  const unique = new Map();

  for (const page of pages) {
    const enabledValue = readCheckboxValue(page, WATCH_ENABLED_PROPERTY_NAMES);
    if (enabledValue === false) continue;

    const watchTitle = readTitleValue(page, titlePropertyName);
    if (!watchTitle) continue;

    const key = normalizeText(watchTitle);
    if (!unique.has(key)) {
      unique.set(key, { watchTitle });
    }
  }

  return [...unique.values()];
}

function getUrlValuesFromPage(page) {
  const values = [];
  for (const propertyName of Object.keys(page.properties ?? {})) {
    const property = page.properties[propertyName];
    if (property?.type === "url" && typeof property.url === "string") {
      values.push(property.url.trim());
    }
  }
  return values.filter(Boolean);
}

async function fetchExistingPurchaseEntries(
  notion,
  purchaseDataSourceId,
  purchaseSchema,
) {
  const pages = await queryDataSourceAll(notion, purchaseDataSourceId);
  const titlePropertyName = pickPropertyNameByType(
    purchaseSchema.properties,
    "title",
    ["タイトル", "名前", "Title", "title"],
  );
  if (!titlePropertyName) {
    throw new Error("買い物DBにtitle型プロパティが見つかりません。");
  }

  const datePropertyName = pickPropertyNameByType(
    purchaseSchema.properties,
    "date",
    ["発売日", "日付", "Release Date", "release_date"],
  );

  const existingTitleSet = new Set();
  const existingKeySet = new Set();
  const existingUrlSet = new Set();

  for (const page of pages) {
    const title = readTitleValue(page, titlePropertyName);
    const releaseDate = datePropertyName
      ? page.properties?.[datePropertyName]?.date?.start
      : null;
    const normalizedTitle = normalizeText(title);
    if (normalizedTitle) {
      existingTitleSet.add(normalizedTitle);
      if (releaseDate) {
        existingKeySet.add(`${normalizedTitle}|${releaseDate}`);
      }
    }

    for (const url of getUrlValuesFromPage(page)) {
      existingUrlSet.add(url);
    }
  }

  return {
    existingTitleSet,
    existingKeySet,
    existingUrlSet,
  };
}

function extractIsoDatesFromText(text) {
  if (typeof text !== "string" || !text) return [];
  const results = [];
  const regex =
    /((?:19|20)\d{2})\s*(?:年|\/|-|\.)\s*(\d{1,2})\s*(?:月|\/|-|\.)\s*(\d{1,2})\s*日?/g;
  for (const match of text.matchAll(regex)) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const isoDate = `${String(year)}-${String(month).padStart(2, "0")}-${String(
      day,
    ).padStart(2, "0")}`;
    results.push(isoDate);
  }
  return [...new Set(results)];
}

function extractVolumeNumber(text) {
  if (typeof text !== "string") return null;
  const match = text.match(/(?:第\s*)?(\d{1,3})\s*巻/);
  if (!match) return null;
  return Number(match[1]);
}

function buildReleaseCandidate({
  watchTitle,
  title,
  releaseDate,
  itemUrl,
  volume,
}) {
  const resolvedTitle =
    typeof title === "string" && title.trim()
      ? title.trim()
      : typeof volume === "number"
        ? `${watchTitle} 第${volume}巻`
        : `${watchTitle} ${releaseDate}発売`;
  return {
    watchTitle,
    title: resolvedTitle,
    releaseDate,
    itemUrl,
    volume: typeof volume === "number" ? volume : null,
  };
}

function dedupeCandidates(candidates) {
  const unique = new Map();
  for (const candidate of candidates) {
    const key = `${normalizeText(candidate.title)}|${candidate.releaseDate}|${candidate.itemUrl}`;
    if (!unique.has(key)) {
      unique.set(key, candidate);
    }
  }
  return [...unique.values()];
}

function pruneNonVolumeDuplicates(candidates) {
  const grouped = new Map();
  for (const candidate of candidates) {
    const key = `${normalizeText(candidate.watchTitle)}|${candidate.releaseDate}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(candidate);
  }

  const pruned = [];
  for (const list of grouped.values()) {
    const hasVolume = list.some((item) => typeof item.volume === "number");
    if (!hasVolume) {
      pruned.push(...list);
      continue;
    }
    pruned.push(...list.filter((item) => typeof item.volume === "number"));
  }
  return pruned;
}

function extractRakutenSalesDateIso(salesDate) {
  const matchedDates = extractIsoDatesFromText(salesDate);
  return matchedDates[0] ?? null;
}

function buildRakutenHeaders() {
  const referer = getRakutenAllowedReferer();
  let origin;
  try {
    origin = new URL(referer).origin;
  } catch {
    throw new Error(
      `RAKUTEN_ALLOWED_REFERER の値が不正です。URL形式で設定してください: ${referer}`,
    );
  }

  return {
    ...RAKUTEN_HTTP_HEADERS,
    Referer: referer,
    Origin: origin,
  };
}

function isLikelySameSeries(watchTitle, item) {
  const normalizedWatch = normalizeText(watchTitle);
  if (!normalizedWatch) return false;

  const normalizedTitle = normalizeText(item?.title ?? "");
  const normalizedSeries = normalizeText(item?.seriesName ?? "");
  if (normalizedTitle.includes(normalizedWatch)) return true;
  if (normalizedSeries && normalizedSeries.includes(normalizedWatch))
    return true;
  return false;
}

function pickRakutenItem(rawItem) {
  if (!rawItem || typeof rawItem !== "object") return null;
  return rawItem.Item && typeof rawItem.Item === "object"
    ? rawItem.Item
    : rawItem;
}

async function fetchReleaseCandidatesFromRakutenEntry(entry) {
  const applicationId = getRakutenApplicationId();
  const accessKey = getRakutenAccessKey();
  if (!applicationId || !accessKey) {
    throw new Error(
      "楽天APIの applicationId / accessKey が設定されていません。",
    );
  }

  const response = await axios.get(RAKUTEN_BOOKS_SEARCH_API, {
    params: {
      applicationId,
      accessKey,
      format: "json",
      title: entry.watchTitle,
      booksGenreId: RAKUTEN_BOOKS_GENRE_ID,
      size: 9,
      sort: "-releaseDate",
      outOfStockFlag: 1,
      hits: RAKUTEN_SEARCH_HITS,
      page: 1,
    },
    timeout: 15000,
    headers: buildRakutenHeaders(),
  });

  if (response.data?.errors) {
    const errorCode = response.data.errors.errorCode ?? "unknown";
    const errorMessage = response.data.errors.errorMessage ?? "unknown";
    throw new Error(`楽天APIエラー (${errorCode}): ${errorMessage}`);
  }
  if (response.data?.error || response.data?.error_description) {
    const errorCode = response.data.error ?? "unknown";
    const errorMessage = response.data.error_description ?? "unknown";
    throw new Error(`楽天APIエラー (${errorCode}): ${errorMessage}`);
  }

  const rawItems = Array.isArray(response.data?.Items)
    ? response.data.Items
    : [];
  const candidates = [];

  for (const rawItem of rawItems) {
    const item = pickRakutenItem(rawItem);
    if (!item || !isLikelySameSeries(entry.watchTitle, item)) continue;

    const releaseDate = extractRakutenSalesDateIso(item.salesDate);
    if (!releaseDate) continue;

    const itemUrl =
      typeof item.itemUrl === "string" && item.itemUrl.trim()
        ? item.itemUrl.trim()
        : null;
    if (!itemUrl) continue;

    const volume = extractVolumeNumber(item.title);
    candidates.push(
      buildReleaseCandidate({
        watchTitle: entry.watchTitle,
        title: item.title,
        releaseDate,
        itemUrl,
        volume,
      }),
    );
  }

  return dedupeCandidates(pruneNonVolumeDuplicates(candidates));
}

function buildPurchasePageProperties(purchaseSchema, candidate) {
  const properties = {};
  const schemaProperties = purchaseSchema.properties;

  const titlePropertyName = pickPropertyNameByType(schemaProperties, "title", [
    "タイトル",
    "名前",
    "Title",
    "title",
  ]);
  if (!titlePropertyName) {
    throw new Error("買い物DBにtitle型プロパティが見つかりません。");
  }
  properties[titlePropertyName] = {
    title: [
      { type: "text", text: { content: truncateText(candidate.title, 100) } },
    ],
  };

  const releaseDatePropertyName = pickPropertyNameByType(
    schemaProperties,
    "date",
    ["発売日", "日付", "Release Date", "release_date"],
  );
  if (releaseDatePropertyName) {
    properties[releaseDatePropertyName] = {
      date: { start: candidate.releaseDate },
    };
  }

  const sourceUrlPropertyName = pickPropertyNameByType(
    schemaProperties,
    "url",
    ["source_url", "URL", "url", "wiki_url", "Wiki URL"],
  );
  if (sourceUrlPropertyName) {
    properties[sourceUrlPropertyName] = { url: candidate.itemUrl };
  }

  const volumeNumberPropertyName = pickPropertyNameByType(
    schemaProperties,
    "number",
    ["巻数", "volume", "Volume"],
  );
  if (volumeNumberPropertyName && typeof candidate.volume === "number") {
    properties[volumeNumberPropertyName] = { number: candidate.volume };
  }

  const statusPropertyName =
    pickPropertyNameByType(schemaProperties, "status", [
      "ステータス",
      "status",
      "Status",
    ]) ??
    pickPropertyNameByType(schemaProperties, "select", [
      "ステータス",
      "status",
      "Status",
    ]);
  if (statusPropertyName) {
    const statusPropertySchema = schemaProperties[statusPropertyName];
    const optionName = pickStatusOptionName(statusPropertySchema);
    if (optionName) {
      if (statusPropertySchema.type === "status") {
        properties[statusPropertyName] = { status: { name: optionName } };
      } else if (statusPropertySchema.type === "select") {
        properties[statusPropertyName] = { select: { name: optionName } };
      }
    }
  }

  return properties;
}

async function collectAndStoreNewReleaseItems(options = {}) {
  if (options.useDummyData) {
    return Array.isArray(options.dummyItems)
      ? options.dummyItems
      : DUMMY_RELEASE_ITEMS;
  }

  ensureRequiredEnv();

  const notion = new NotionClient({
    auth: process.env.NOTION_INTEGRATION_SECRET,
  });
  const watchDataSourceId = await resolveNotionDataSourceId(
    notion,
    getNotionBookContainerId(),
  );
  const purchaseDataSourceId = await resolveNotionDataSourceId(
    notion,
    getNotionPurchaseContainerId(),
  );

  const purchaseSchema = await notion.dataSources.retrieve({
    data_source_id: purchaseDataSourceId,
  });
  const watchEntries = await fetchWatchEntries(notion, watchDataSourceId);
  const { existingTitleSet, existingKeySet } =
    await fetchExistingPurchaseEntries(
      notion,
      purchaseDataSourceId,
      purchaseSchema,
    );

  const todayJst = getJstDateString();
  const weekAgoJst = shiftIsoDate(todayJst, -6);
  const addedItems = [];

  for (const entry of watchEntries) {
    // 楽天APIのレート制限回避のため、1秒待機
    await new Promise((resolve) => setTimeout(resolve, 1200));

    let candidates = [];
    try {
      candidates = await fetchReleaseCandidatesFromRakutenEntry(entry);
    } catch (apiError) {
      console.error(`楽天APIエラー (${entry.watchTitle}):`, apiError.message);
      continue;
    }

    for (const candidate of candidates) {
      if (
        !isWithinInclusiveRange(candidate.releaseDate, weekAgoJst, todayJst)
      ) {
        continue;
      }

      const normalizedTitle = normalizeText(candidate.title);
      const releaseKey = `${normalizedTitle}|${candidate.releaseDate}`;
      if (
        existingKeySet.has(releaseKey) ||
        existingTitleSet.has(normalizedTitle)
      ) {
        continue;
      }

      // Notion APIの制限回避のため、少し待機
      await new Promise((resolve) => setTimeout(resolve, 350));

      await notion.pages.create({
        parent: { data_source_id: purchaseDataSourceId },
        properties: buildPurchasePageProperties(purchaseSchema, candidate),
      });

      existingTitleSet.add(normalizedTitle);
      existingKeySet.add(releaseKey);
      addedItems.push(candidate);
    }
  }

  return addedItems;
}

function buildReleaseNotification(addedItems) {
  const maxLines = 20;
  const listed = addedItems.slice(0, maxLines);
  const lines = listed.map(
    (item) => `・${item.title} (${item.releaseDate})\n  ${item.itemUrl}`,
  );
  if (addedItems.length > maxLines) {
    lines.push(`…他 ${addedItems.length - maxLines} 件`);
  }
  return lines.join("\n");
}

async function notifyReleaseToDiscord(client, addedItems) {
  const safeItems = Array.isArray(addedItems) ? addedItems : [];
  const hasNewItems = safeItems.length > 0;

  const channelId = process.env.MANGA_NOTIFICATION_CHANNEL_ID;
  const channelName =
    process.env.MANGA_NOTIFICATION_CHANNEL_NAME ?? DEFAULT_CHANNEL_NAME;
  const messageBody = hasNewItems ? buildReleaseNotification(safeItems) : "";
  const embed = hasNewItems
    ? new EmbedBuilder()
        .setColor(0x3ba55d)
        .setTitle("買い物リストに追加しました：")
        .setDescription(
          messageBody.length > 4096
            ? `${messageBody.slice(0, 4093)}...`
            : messageBody,
        )
        .setTimestamp()
    : new EmbedBuilder()
        .setColor(0x95a5a6)
        .setTitle("結果：")
        .setDescription(
          "直近7日以内に買い物リストへ追加すべき新刊はありませんでした。",
        )
        .setTimestamp();

  const sendPromises = [];
  let foundChannels = 0;

  for (const guild of client.guilds.cache.values()) {
    const channel =
      (channelId && guild.channels.cache.get(channelId)) ||
      guild.channels.cache.find(
        (ch) => ch.name === channelName && ch.type === ChannelType.GuildText,
      );

    if (channel && channel.type === ChannelType.GuildText) {
      foundChannels += 1;
      sendPromises.push(
        channel.send({
          content: hasNewItems
            ? `${safeItems.length}件を買い物リストへ追加しました。`
            : "追加対象は0件でした。",
          embeds: [embed],
        }),
      );
    }
  }

  if (foundChannels === 0) {
    throw new Error(
      `通知先チャンネルが見つかりません。MANGA_NOTIFICATION_CHANNEL_ID または "${channelName}" の存在を確認してください。`,
    );
  }

  await Promise.all(sendPromises);
}

async function mangaRelease(client, options = {}) {
  const addedItems = await collectAndStoreNewReleaseItems(options);
  await notifyReleaseToDiscord(client, addedItems);
  return addedItems;
}

export { mangaRelease, collectAndStoreNewReleaseItems };
