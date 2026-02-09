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

/* ================= DICE EMOJI ================= */
const DICE = {
  1: "<:dice1:1470461068836077740>",
  2: "<:dice2:1470461090197410095>",
  3: "<:dice3:1470461110040662217>",
  4: "<:dice4:1470461130064400495>",
  5: "<:dice5:1470461150578610339>",
  6: "<:dice6:1470461041145151582>"
};
const diceEmoji = n => DICE[n];

/* ================= BẦU CUA ================= */
const BAUCUA = {
  bau: "🍐 BẦU",
  cua: "🦀 CUA",
  tom: "🦐 TÔM",
  ca: "🐟 CÁ",
  ga: "🐓 GÀ",
  nai: "🦌 NAI"
};
const BAUCUA_KEYS = Object.keys(BAUCUA);

/* ================= ROOMS ================= */
let room = {
  open: false,
  bets: {},
  message: null,
  time: 0,
  channel: null
};

let baucua = {
  open: false,
  bets: {},
  message: null,
  time: 45,
  channel: null
};

/* ================= COMMAND REGISTER ================= */
client.once("ready", async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder().setName("taixiu").setDescription("🎲 Mở ván Tài Xỉu"),
    new SlashCommandBuilder().setName("baucua").setDescription("🎲 Mở ván Bầu Cua"),
    new SlashCommandBuilder().setName("nhantien").setDescription("💰 Nhận 100 coin mỗi ngày"),
    new SlashCommandBuilder().setName("sodu").setDescription("💳 Xem số dư"),
    new SlashCommandBuilder()
      .setName("chuyencoin")
      .setDescription("💸 Chuyển coin")
      .addUserOption(o => o.setName("user").setDescription("Người nhận").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setDescription("Số coin").setRequired(true)),
    new SlashCommandBuilder()
      .setName("addcoin")
      .setDescription("🛠 Admin cộng coin")
      .addUserOption(o => o.setName("user").setDescription("Người nhận").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setDescription("Số coin").setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

/* ================= INTERACTION ================= */
client.on("interactionCreate", async interaction => {
  try {

    /* ===== CHUYỂN COIN (FIX CỨNG) ===== */
    if (interaction.isChatInputCommand() && interaction.commandName === "chuyencoin") {
      const to = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");
      const from = getUser(interaction.user.id);

      if (amount <= 0)
        return interaction.reply({ content: "❌ Số coin không hợp lệ", ephemeral: true });

      if (from.coin < amount)
        return interaction.reply({ content: "❌ Không đủ coin", ephemeral: true });

      from.coin -= amount;
      getUser(to.id).coin += amount;
      save();

      return interaction.reply(
        `💸 **CHUYỂN COIN THÀNH CÔNG**\n` +
        `👤 Người nhận: <@${to.id}>\n` +
        `💰 Số coin: **${amount}**\n` +
        `💳 Số dư còn lại: **${from.coin}**`
      );
    }

    /* ===== SLASH KHÁC ===== */
    if (interaction.isChatInputCommand()) {
      await interaction.deferReply();

      if (interaction.commandName === "sodu") {
        const u = getUser(interaction.user.id);
        return interaction.editReply(`💳 **Số dư:** ${u.coin} coin`);
      }

      if (interaction.commandName === "nhantien") {
        const u = getUser(interaction.user.id);
        if (Date.now() - u.lastDaily < 86400000)
          return interaction.editReply("⏳ Hôm nay nhận rồi");

        u.coin += 100;
        u.lastDaily = Date.now();
        save();
        return interaction.editReply(`💰 +100 coin | Tổng: ${u.coin}`);
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

      /* ===== BẦU CUA ===== */
      if (interaction.commandName === "baucua") {
        if (baucua.open)
          return interaction.editReply("⏳ Đang có ván Bầu Cua khác");

        baucua.open = true;
        baucua.bets = {};
        baucua.time = 45;
        baucua.channel = interaction.channel;

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("bau").setLabel("🍐 Bầu").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("cua").setLabel("🦀 Cua").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("tom").setLabel("🦐 Tôm").setStyle(ButtonStyle.Primary)
        );
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ca").setLabel("🐟 Cá").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("ga").setLabel("🐓 Gà").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("nai").setLabel("🦌 Nai").setStyle(ButtonStyle.Primary)
        );

        baucua.message = await interaction.editReply({
          content:
            `🎰 **BẦU CUA**\n🍐 🦀 🦐 🐟 🐓 🦌\n⏳ Còn **45s** để đặt cược`,
          components: [row1, row2]
        });

        const timer = setInterval(async () => {
          baucua.time--;
          if (baucua.time <= 0) {
            clearInterval(timer);
            await rollBauCua();
            return;
          }
          baucua.message.edit({
            content:
              `🎰 **BẦU CUA**\n🍐 🦀 🦐 🐟 🐓 🦌\n⏳ Còn **${baucua.time}s** để đặt cược`,
            components: [row1, row2]
          });
        }, 1000);
      }
    }

    /* ===== BUTTON BẦU CUA ===== */
    if (interaction.isButton() && baucua.open && BAUCUA_KEYS.includes(interaction.customId)) {
      const modal = new ModalBuilder()
        .setCustomId(`baucua_${interaction.customId}`)
        .setTitle("Nhập số coin cược")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("amount")
              .setLabel("Số coin")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

      return interaction.showModal(modal);
    }

    /* ===== MODAL BẦU CUA ===== */
    if (interaction.isModalSubmit() && interaction.customId.startsWith("baucua_")) {
      const choice = interaction.customId.split("_")[1];
      const amount = parseInt(interaction.fields.getTextInputValue("amount"));
      const user = getUser(interaction.user.id);

      if (isNaN(amount) || amount <= 0)
        return interaction.reply({ content: "❌ Số coin không hợp lệ", ephemeral: true });

      if (user.coin < amount)
        return interaction.reply({ content: "❌ Không đủ coin", ephemeral: true });

      user.coin -= amount;
      baucua.bets[interaction.user.id] = { choice, amount };
      save();

      return interaction.reply({
        content: `✅ Đã cược **${amount} coin** vào **${BAUCUA[choice]}**`,
        ephemeral: true
      });
    }

  } catch (e) {
    console.error(e);
  }
});

/* ================= ROLL BẦU CUA ================= */
async function rollBauCua() {
  const r1 = BAUCUA_KEYS[rand() - 1];
  const r2 = BAUCUA_KEYS[rand() - 1];
  const r3 = BAUCUA_KEYS[rand() - 1];
  const result = [r1, r2, r3];

  let text =
    `🎲 **KẾT QUẢ BẦU CUA**\n` +
    `${BAUCUA[r1]} ${BAUCUA[r2]} ${BAUCUA[r3]}\n\n`;

  for (const uid in baucua.bets) {
    const bet = baucua.bets[uid];
    const user = getUser(uid);
    const count = result.filter(x => x === bet.choice).length;

    if (count > 0) {
      const win = bet.amount * count;
      user.coin += bet.amount + win;
      text += `🎉 <@${uid}> trúng ${count} × ${BAUCUA[bet.choice]} (+${win})\n`;
    } else {
      text += `💀 <@${uid}> thua ${bet.amount}\n`;
    }
  }

  save();
  baucua.open = false;
  await baucua.channel.send(text);
}

function rand() {
  return Math.floor(Math.random() * 6) + 1;
}

/* ================= LOGIN ================= */
client.login(TOKEN);
