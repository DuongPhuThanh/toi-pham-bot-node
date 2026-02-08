const { Client, GatewayIntentBits } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = process.env.DISCORD_TOKEN;

client.once("ready", () => {
  console.log(`✅ Bot online: ${client.user.tag}`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  if (message.content === "!ping") {
    message.reply("🏓 Pong! Bot Tội Phạm đã hoạt động.");
  }
});

if (!TOKEN) {
  console.error("❌ Thiếu DISCORD_TOKEN");
  process.exit(1);
}

client.login(TOKEN);
