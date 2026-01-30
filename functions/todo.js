import { Client } from "@notionhq/client";
import "dotenv/config";

const { NOTION_INTEGRATION_SECRET, NOTION_DATASOURCE_ID } = process.env;
const PARENT_PROPERTY_NAME = "親アイテム"; 
const notion = new Client({ auth: NOTION_INTEGRATION_SECRET });


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

async function getParentPath(page) {
    const parents = [];
    let currentBlock = page;
    let depth = 0;
    const MAX_DEPTH = 5;

    while (depth < MAX_DEPTH) {
        const parentProperty = currentBlock.properties[PARENT_PROPERTY_NAME] || currentBlock.properties["Parent item"];
        if (!parentProperty || !parentProperty.relation || parentProperty.relation.length === 0) break;

        const parentId = parentProperty.relation[0].id;
        try {
            const parentPage = await notion.pages.retrieve({ page_id: parentId });
            const parentTitle = parentPage.properties["名前"]?.title?.[0]?.text?.content || "親タイトル不明";
            parents.unshift(parentTitle);
            currentBlock = parentPage;
            depth++;
        } catch (error) { break; }
    }
    return parents;
}

async function getPageContent(pageId, indentLevel = 0) {
    const response = await notion.blocks.children.list({ block_id: pageId });
    let contentList = [];
    const indent = "  ".repeat(indentLevel);

    for (let block of response.results) {
        const text = getTextFromBlock(block);
        if (text) contentList.push(`${indent}${text}`);
        if (block.has_children) {
            const childrenContent = await getPageContent(block.id, indentLevel + 1);
            contentList = contentList.concat(childrenContent);
        }
    }
    return contentList;
}

export async function fetchFormattedTasks() {
    try {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 7);
        const isoDate = targetDate.toISOString().split('T')[0];

        const response = await notion.dataSources.query({
            data_source_id: NOTION_DATASOURCE_ID,
            filter: {
                and: [
                    { property: "済", checkbox: { equals: false } },
                    { property: "日付", date: { on_or_before: isoDate } }
                ]
            }
        });

        let formattedOutput = "";

        for (const page of response.results) {
            await new Promise(resolve => setTimeout(resolve, 350)); // API制限回避

            const title = page.properties["名前"]?.title?.[0]?.text?.content || "タイトルなし";
            const dateData = page.properties["日付"]?.date;
            const dateStr = dateData ? `${dateData.start}${dateData.end ? " 〜 " + dateData.end : ""}` : "未設定";

            const parentPathList = await getParentPath(page);
            const hierarchy = [...parentPathList, title].join(" > ");
            const contentLines = await getPageContent(page.id);
            const contentStr = contentLines.length > 0 ? contentLines.join("\n") : "(詳細なし)";

            formattedOutput += `## タスク: ${hierarchy}\n`;
            formattedOutput += `- **期日**: ${dateStr}\n`;
            formattedOutput += `- **本文内容**:\n${contentStr}\n`;
            formattedOutput += `\n---\n\n`;
        }

        return formattedOutput || "該当するタスクはありません。";

    } catch (error) {
        console.error('データ取得エラー:', error);
        throw error;
    }
}

const result = await fetchFormattedTasks();
console.log(result);