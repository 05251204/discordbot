const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('hey')
		.setDescription('あいさつに反応してbotが返事します'),
	execute: async function(interaction) {
		await interaction.reply('Fuck.');
	},
};