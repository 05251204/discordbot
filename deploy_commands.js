import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url'; // pathToFileURL を追加

const { APPLICATION_ID, GUILD_ID, TOKEN } = process.env;

// ESMでは__dirnameが使えないため、import.meta.urlからパスを解決
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// 各コマンドのSlashCommandBuilder#toJSON()の出力をデプロイ用に取得
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    // path.toFileUrl を pathToFileURL に修正
    const command = await import(pathToFileURL(filePath).href);

    if ('data' in command.default) {
        commands.push(command.default.data.toJSON());
    } else {
        console.log(`[警告] ${filePath} のコマンドには、必須の "data" プロパティがありません。`);
    }
}

// RESTモジュールのインスタンスを構築
const rest = new REST().setToken(TOKEN);

// コマンドをデプロイ
(async () => {
	try {
		console.log(`${commands.length}個のアプリケーションコマンドのリフレッシュを開始しました。`);

		const data = await rest.put(
			Routes.applicationGuildCommands(APPLICATION_ID, GUILD_ID),
			{ body: commands },
		);

		console.log(`${data.length}個のアプリケーションコマンドを正常にリロードしました。`);
	} catch (error) {
		console.error(error);
	}
})();