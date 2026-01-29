import { Client } from "@notionhq/client";
const notion = new Client({ auth: "secret" });
console.log(notion.databases);
console.log("query exists:", typeof notion.databases.query);
