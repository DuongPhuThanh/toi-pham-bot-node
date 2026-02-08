const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes
} = require("discord.js");
const fs = require("fs");

const TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

if (!TOKEN) {
  console.error("❌ Thiếu DISCORD_TOKEN");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ================= DATA ================= */
const DATA_FILE = "./data.json";
let data = fs.existsSync(DATA_FILE)
  ? JSON.parse(fs.readFileSync(DATA_FILE))
  : { users: {} };

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getUser(id) {
  if (!data.users[id]) {
    data.users[id] = { coin: 0, lastDaily: 0 };
  }
  return data.users[id];
}

/* ================= REGISTER COMMAND ================= */
client.once("ready", async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder().setName("taixiu").setDescription("🎲 Chơi Tài Xỉu"),
    new SlashCommandBuilder().setName("nhantien").setDescription("💰 Nhận 100 coin mỗi ngày"),
    new SlashCommandBuilder()
      .setName("addcoin")
      .setDescription("🛠 Admin cộng tiền")
      .addUserOption(o => o.setName("user").setDescription("Người nhận").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setDescription("Số coin").setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });

  console.log("✅ Slash command đã đăng ký");
});

/* ================= INTERACTION ================= */
client.on("interactionCreate", async (interaction) => {
  try {

    /* ===== SLASH COMMAND ===== */
    if (interaction.isChatInputCommand()) {

      // 🔥 QUAN TRỌNG
      await interaction.deferReply();

      if (interaction.commandName === "nhantien") {
        const user = getUser(interaction.user.id);
        const now = Date.now();

        if (now - user.lastDaily < 86400000) {
          return interaction.editReply("⏳ Bạn đã nhận hôm nay rồi!");
        }

        user.coin += 100;
        user.lastDaily = now;
        save();

        return interaction.editReply(`💰 Nhận **100 coin**\n💳 Số dư: **${user.coin}**`);
      }

      if (interaction.commandName === "addcoin") {
        if (interaction.user.id !== ADMIN_ID) {
          return interaction.editReply("❌ Không có quyền");
        }

        const target = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");

        const user = getUser(target.id);
        user.coin += amount;
        save();

        return interaction.editReply(`✅ Đã cộng **${amount} coin** cho ${target}`);
      }

      if (interaction.commandName === "taixiu") {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("tai")
            .setLabel("🎲 Tài (11–18)")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId("xiu")
            .setLabel("🎲 Xỉu (3–10)")
            .setStyle(ButtonStyle.Danger)
        );

        return interaction.editReply({
          content: "🎰 **TÀI XỈU**\nChọn cửa:",
          components: [row]
        });
      }
    }

    /* ===== BUTTON ===== */
    if (interaction.isButton()) {

      // 🔥 CỨU MẠNG
      await interaction.deferUpdate();

      const dice = Math.floor(Math.random() * 16) + 3;
      const choice = interaction.customId;
      const win =
        (choice === "tai" && dice >= 11) ||
        (choice === "xiu" && dice <= 10);

      const user = getUser(interaction.user.id);
      const result = win ? 50 : -50;
      user.coin += result;
      save();

      await interaction.followUp({
        content:
          `🎲 Kết quả: **${dice}**\n` +
          `${win ? "🎉 THẮNG" : "💀 THUA"} (${result} coin)\n` +
          `💳 Số dư: **${user.coin}**`
      });
    }

  } catch (err) {
    console.error(err);
    if (!interaction.replied) {
      await interaction.reply({ content: "❌ Lỗi bot", ephemeral: true });
    }
  }
});

/* ================= LOGIN ================= */
client.login(TOKEN);
