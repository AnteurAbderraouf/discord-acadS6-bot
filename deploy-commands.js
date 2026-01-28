require("dotenv").config();
const { REST, Routes } = require("discord.js");

const commands = [
  require("./commands/setup").data.toJSON()
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );
    console.log("✅ Slash command déployée");
  } catch (error) {
    console.error(error);
  }
})();
