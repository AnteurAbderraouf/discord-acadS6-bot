const {
  SlashCommandBuilder,
  ChannelType,
  PermissionsBitField
} = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure le serveur avec un preset")
    .addStringOption(opt =>
      opt.setName("preset")
        .setDescription("Nom du preset")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: "❌ Admin requis.", ephemeral: true });
    }

    const presetName = interaction.options.getString("preset");
    const presetPath = path.join(__dirname, `../presets/${presetName}.json`);

    if (!fs.existsSync(presetPath)) {
      return interaction.reply({ content: "❌ Preset introuvable.", ephemeral: true });
    }

    await interaction.reply({ content: "⚙️ Configuration en cours...", ephemeral: true });

    const preset = JSON.parse(fs.readFileSync(presetPath));
    const guild = interaction.guild;

    for (const category of preset.categories) {
      const createdCategory = await guild.channels.create({
        name: category.name,
        type: ChannelType.GuildCategory
      });

      for (const channel of category.channels) {
        await guild.channels.create({
          name: channel.name,
          type: channel.type === "voice"
            ? ChannelType.GuildVoice
            : ChannelType.GuildText,
          parent: createdCategory.id
        });
      }
    }

    for (const role of preset.roles) {
      await guild.roles.create(role);
    }

    await interaction.editReply("✅ Serveur configuré.");
  }
};
