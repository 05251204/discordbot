import { Client } from "@notionhq/client";
import fs from "node:fs";
import "dotenv/config";
const { NOTION_INTEGRATION_SECRET, NOTION_DATASOURCE_ID } = process.env;

const PARENT_PROPERTY_NAME = "親アイテム"; 
const notion = new Client({ auth: NOTION_INTEGRATION_SECRET });

async function getParentPath(page) {
    const parents = [];
    let currentBlock = page;
    let depth = 0;
    const MAX_DEPTH = 5; // 無限ループ防止

    while (depth < MAX_DEPTH) {
        // プロパティが存在するか確認
        const parentProperty = currentBlock.properties[PARENT_PROPERTY_NAME] || currentBlock.properties["Parent item"];

        if (!parentProperty || !parentProperty.relation || parentProperty.relation.length === 0) {
            break;
        }

        const parentId = parentProperty.relation[0].id;

        try {
            const parentPage = await notion.pages.retrieve({ page_id: parentId });
            const parentTitle = parentPage.properties["名前"]?.title?.[0]?.text?.content || "親タイトル不明";
            
            parents.unshift(parentTitle); // 配列の先頭に追加
            currentBlock = parentPage;
            depth++;
        } catch (error) {
            console.error(`親取得エラー: ${parentId}`);
            break;
        }
    }
    return parents;
}

async function getPageContent(pageId, indentLevel = 0) {
    const response = await notion.blocks.children.list({ block_id: pageId });
    let contentList = [];
    const indent = "  ".repeat(indentLevel);

    for (let block of response.results) {
        const text = getTextFromBlock(block);
        if (text) {
            contentList.push(`${indent}${text}`);
        }
        
        if (block.has_children) {
            const childrenContent = await getPageContent(block.id, indentLevel + 1);
            contentList = contentList.concat(childrenContent);
        }
    }
    return contentList;
}

function getTextFromBlock(block) {
    switch (block.type) {
        case "paragraph":
            return block.paragraph.rich_text.map(t => t.plain_text).join("");
        case "heading_1":
            return `# ${block.heading_1.rich_text.map(t => t.plain_text).join("")}`;
        case "heading_2":
            return `## ${block.heading_2.rich_text.map(t => t.plain_text).join("")}`;
        case "heading_3":
            return `### ${block.heading_3.rich_text.map(t => t.plain_text).join("")}`;
        case "to_do":
            const status = block.to_do.checked ? "[x]" : "[ ]";
            return `${status} ${block.to_do.rich_text.map(t => t.plain_text).join("")}`;
        case "bulleted_list_item":
            return `- ${block.bulleted_list_item.rich_text.map(t => t.plain_text).join("")}`;
        case "numbered_list_item":
            return `1. ${block.numbered_list_item.rich_text.map(t => t.plain_text).join("")}`;
        case "toggle":
            return `> [トグル] ${block.toggle.rich_text.map(t => t.plain_text).join("")}`;
        case "quote":
            return `> ${block.quote.rich_text.map(t => t.plain_text).join("")}`;
        case "code":
            return `\`\`\`${block.code.language}\n${block.code.rich_text.map(t => t.plain_text).join("")}\n\`\`\``;
        case "callout":
            return `(注: ${block.callout.rich_text.map(t => t.plain_text).join("")})`;
        default:
            return "";
    }
}

// --- メイン処理 ---
async function getDatabaseContent() {
    try {
        console.log("タスクを取得中...");

        // 日付計算
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 7);
        const isoDate = targetDate.toISOString().split('T')[0];

        const response = await notion.dataSources.query({
            data_source_id: NOTION_DATASOURCE_ID, // database_id の代わりに data_source_id
            filter: {
                and: [
                    {
                        property: "済", // あなたの環境のチェックボックス名
                        checkbox: { equals: false }
                    },
                    {
                        property: "日付", // あなたの環境の日付プロパティ名
                        date: { on_or_before: isoDate }
                    }
                ]
            }
        });

        // LLMへのプロンプト用テキストを構築
        let promptText = "以下は、現在未完了で、かつ期日が1週間以内に迫っているタスクのリストです。\n";
        promptText += "このリストを元に、今日の優先順位とアドバイスを提示してください。\n\n";
        promptText += "--- タスクリスト ---\n\n";

        for (const page of response.results) {
            const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            await sleep(350);
            const pageId = page.id;
            const title = page.properties["名前"]?.title?.[0]?.text?.content || "タイトルなし";
            
            // 日付の取得
            const dateData = page.properties["日付"]?.date;
            const dateStr = dateData ? `${dateData.start}${dateData.end ? " 〜 " + dateData.end : ""}` : "日付未設定";

            // 親階層の取得 (Project A > SubProject B > Task)
            const parentPathList = await getParentPath(page);
            const hierarchy = [...parentPathList, title].join(" > ");

            // ページ内コンテンツの取得
            const contentLines = await getPageContent(pageId);
            const contentStr = contentLines.length > 0 ? contentLines.join("\n") : "(詳細なし)";

            // 1つのタスクブロックを生成
            promptText += `### タスク: ${hierarchy}\n`;
            promptText += `- 期日: ${dateStr}\n`;
            promptText += `- 詳細内容:\n${contentStr}\n`;
            promptText += "\n----------------------------------------\n\n";
            
            console.log(`処理完了: ${title}`);
        }

        // ファイルに保存
        fs.writeFileSync("todo_for_llm.txt", promptText);
        console.log("完了！ファイル 'todo_for_llm.txt' が作成されました。この中身をLLMに渡してください。");

    } catch (error) {
        console.error('エラーが発生しました:', error);
    }
}

getDatabaseContent();