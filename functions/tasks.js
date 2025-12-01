import { promises as fs } from "fs";
import path from "path";
import process from "process";
import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";

// 権限の範囲（タスクの読み書き）
const SCOPES = ["https://www.googleapis.com/auth/tasks"];

// 認証情報ファイルとトークン保存ファイルのパス
// process.cwd() はコマンドを実行したディレクトリ(プロジェクトルート)を指します
const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "credentials.json");

/**
 * 保存されたトークンがあれば読み込む
 */
async function loadSavedCredentialsIfExist() {
  try {
    const content = await fs.readFile(TOKEN_PATH);
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch (err) {
    return null;
  }
}

/**
 * トークンを保存する
 */
async function saveCredentials(client) {
  const content = await fs.readFile(CREDENTIALS_PATH);
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  const payload = JSON.stringify({
    type: "authorized_user",
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  await fs.writeFile(TOKEN_PATH, payload);
}

/**
 * 認証を行うメイン関数
 */
async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) {
    return client;
  }
  // 認証がない場合はブラウザを起動して認証フローを開始
  client = await authenticate({
    scopes: SCOPES,
    keyfilePath: CREDENTIALS_PATH,
  });
  if (client.credentials) {
    await saveCredentials(client);
  }
  return client;
}

/**
 * タスクリストを取得して表示する
 */
async function listTasks(auth) {
  const service = google.tasks({ version: "v1", auth });

  try {
    // デフォルトのタスクリストからタスクを取得
    const res = await service.tasks.list({
      tasklist: "@default",
      maxResults: 10,
    });

    const tasks = res.data.items;
    if (!tasks || tasks.length === 0) {
      console.log("タスクは見つかりませんでした。");
      return;
    }

    console.log("あなたのタスク一覧:");
    tasks.forEach((task) => {
      console.log(`- ${task.title} (${task.status})`);
    });
  } catch (err) {
    console.error("APIエラー:", err);
  }
}

// --- 実行 ---
// ES Moduleではトップレベルawaitも使えますが、今回は既存の構成に合わせて実行します
authorize().then(listTasks).catch(console.error);
