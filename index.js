const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");
const fs = require("fs");

const TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const GUILD_ID = process.env.GUILD_ID;

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

/* ================= COMMAND REGISTER ================= */
client.once("ready", async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("taixiu")
      .setDescription("🎲 Mở ván Tài Xỉu"),

    new SlashCommandBuilder()
      .setName("nhantien")
      .setDescription("💰 Nhận 100 coin mỗi ngày"),

    new SlashCommandBuilder()
      .setName("sodu")
      .setDescription("💳 Xem số dư hiện tại"),

    new SlashCommandBuilder()
      .setName("chuyencoin")
      .setDescription("💸 Chuyển coin cho người khác")
      .addUserOption(o =>
        o.setName("user").setDescription("Người nhận").setRequired(true)
      )
      .addIntegerOption(o =>
        o.setName("amount").setDescription("Số coin").setRequired(true)
      ),

    new SlashCommandBuilder()
      .setName("addcoin")
      .setDescription("🛠 Admin cộng tiền")
      .addUserOption(o =>
        o.setName("user").setDescription("Người nhận").setRequired(true)
      )
      .addIntegerOption(o =>
        o.setName("amount").setDescription("Số coin").setRequired(true)
      )
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  // ⚡ GUILD COMMAND – HIỆN NGAY
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, GUILD_ID),
    { body: commands }
  );

  console.log("✅ Slash command đã sync cho server");
});

/* ================= INTERACTION ================= */
client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;
  await interaction.deferReply({ ephemeral: true });

  const userData = getUser(interaction.user.id);

  if (interaction.commandName === "sodu") {
    return interaction.editReply(`💳 Số dư của mày: **${userData.coin} coin**`);
  }

  if (interaction.commandName === "chuyencoin") {
    const to = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");

    if (amount <= 0)
      return interaction.editReply("❌ Số coin không hợp lệ");

    if (userData.coin < amount)
      return interaction.editReply("❌ Không đủ coin");

    userData.coin -= amount;
    getUser(to.id).coin += amount;
    save();

    return interaction.editReply(
      `💸 Đã chuyển **${amount} coin** cho <@${to.id}>`
    );
  }

  if (interaction.commandName === "nhantien") {
    if (Date.now() - userData.lastDaily < 86400000)
      return interaction.editReply("⏳ Hôm nay mày nhận rồi");

    userData.coin += 100;
    userData.lastDaily = Date.now();
    save();

    return interaction.editReply(`💰 +100 coin | Số dư: ${userData.coin}`);
  }

  if (interaction.commandName === "addcoin") {
    if (interaction.user.id !== ADMIN_ID)
      return interaction.editReply("❌ Không có quyền");

    const t = interaction.options.getUser("user");
    const a = interaction.options.getInteger("amount");
    getUser(t.id).coin += a;
    save();

    return interaction.editReply(`✅ Đã cộng ${a} coin cho ${t}`);
  }
});

/* ================= LOGIN ================= */
client.login(TOKEN);
