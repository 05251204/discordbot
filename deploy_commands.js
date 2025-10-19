require('dotenv').config(); // .envファイルを読み込む
const { REST, Routes } = require('discord.js');
const { APPLICATION_ID, GUILD_ID, TOKEN } = process.env; // .envから変数を読み込む
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// 各コマンドのSlashCommandBuilder#toJSON()の出力をデプロイ用に取得
for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath);
	if ('data' in command && 'execute' in command) {
		commands.push(command.data.toJSON());
	} else {
		console.log(`[WARNING] ${filePath} のコマンドには、必須の "data" または "execute" プロパティがありません。`);
	}
}

// RESTモジュールのインスタンスを構築
const rest = new REST().setToken(TOKEN);

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
