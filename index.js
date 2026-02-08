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

/* ================= COMMAND ================= */
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
});

/* ================= INTERACTION ================= */
client.on("interactionCreate", async (interaction) => {
  try {

    /* ===== SLASH ===== */
    if (interaction.isChatInputCommand()) {
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

        getUser(target.id).coin += amount;
        save();

        return interaction.editReply(`✅ Đã cộng **${amount} coin** cho ${target}`);
      }

      if (interaction.commandName === "taixiu") {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("tai").setLabel("Tài (11–18)").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("xiu").setLabel("Xỉu (3–10)").setStyle(ButtonStyle.Danger)
        );

        return interaction.editReply({
          content: "🎰 **TÀI XỈU**\nChọn cửa để đặt cược:",
          components: [row]
        });
      }
    }

    /* ===== BUTTON → MODAL ===== */
    if (interaction.isButton()) {
      const modal = new ModalBuilder()
        .setCustomId(`bet_${interaction.customId}`)
        .setTitle("Nhập số tiền cược");

      const input = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel("Số coin muốn cược")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    /* ===== MODAL SUBMIT ===== */
    if (interaction.isModalSubmit()) {
      const choice = interaction.customId.split("_")[1];
      const bet = parseInt(interaction.fields.getTextInputValue("amount"));
      const user = getUser(interaction.user.id);

      if (isNaN(bet) || bet <= 0) {
        return interaction.reply({ content: "❌ Số tiền không hợp lệ", ephemeral: true });
      }

      if (user.coin < bet) {
        return interaction.reply({ content: "❌ Không đủ coin", ephemeral: true });
      }

      user.coin -= bet;
      save();

      await interaction.reply(`⏳ **Đang lắc xúc xắc... (45s)**`);

      let time = 45;
      const msg = await interaction.fetchReply();

      const interval = setInterval(async () => {
        time--;
        if (time <= 0) {
          clearInterval(interval);

          const d1 = Math.floor(Math.random() * 6) + 1;
          const d2 = Math.floor(Math.random() * 6) + 1;
          const d3 = Math.floor(Math.random() * 6) + 1;
          const total = d1 + d2 + d3;

          const isTai = total >= 11;
          const win =
            (choice === "tai" && isTai) ||
            (choice === "xiu" && !isTai);

          if (win) user.coin += bet * 2;
          save();

          return msg.edit(
            `🎲 **KẾT QUẢ**\n` +
            `🎲🎲🎲 = **${total}**\n` +
            `👉 ${isTai ? "TÀI" : "XỈU"}\n\n` +
            `${win ? "🎉 THẮNG" : "💀 THUA"}\n` +
            `👤 <@${interaction.user.id}>\n` +
            `💳 Số dư: **${user.coin}**`
          );
        }

        msg.edit(`⏳ **Đang lắc xúc xắc... ${time}s**`);
      }, 1000);
    }

  } catch (e) {
    console.error(e);
  }
});

/* ================= LOGIN ================= */
client.login(TOKEN);
