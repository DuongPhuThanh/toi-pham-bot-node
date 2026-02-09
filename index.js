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

/* ================= ROOM ================= */
let room = {
  open: false,
  bets: {},
  message: null,
  time: 0,
  channel: null
};

/* ================= COMMAND REGISTER ================= */
client.once("ready", async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder().setName("taixiu").setDescription("🎲 Mở ván Tài Xỉu"),
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
client.on("interactionCreate", async (interaction) => {
  try {

    /* ===== SLASH ===== */
    if (interaction.isChatInputCommand()) {

      /* 🔥 FIX CHUYỂN COIN – KHÔNG deferReply */
      if (interaction.commandName === "chuyencoin") {
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

      /* ===== CÁC LỆNH KHÁC → CẦN defer ===== */
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

      if (interaction.commandName === "taixiu") {
        if (room.open)
          return interaction.editReply("⏳ Đang có ván khác");

        room.open = true;
        room.bets = {};
        room.time = 45;
        room.channel = interaction.channel;

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("tai").setLabel("🎲 Tài (11–18)").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("xiu").setLabel("🎲 Xỉu (3–10)").setStyle(ButtonStyle.Danger)
        );

        room.message = await interaction.editReply({
          content:
            `🎰 **TÀI XỈU**\n` +
            `${diceEmoji(1)} ${diceEmoji(2)} ${diceEmoji(3)}\n` +
            `⏳ Còn **45s** để đặt cược`,
          components: [row]
        });

        const timer = setInterval(async () => {
          room.time--;
          if (room.time <= 0) {
            clearInterval(timer);
            await rollDice();
            return;
          }
          room.message.edit({
            content:
              `🎰 **TÀI XỈU**\n` +
              `${diceEmoji(1)} ${diceEmoji(2)} ${diceEmoji(3)}\n` +
              `⏳ Còn **${room.time}s** để đặt cược`,
            components: [row]
          });
        }, 1000);
      }
    }

    /* ===== BUTTON ===== */
    if (interaction.isButton()) {
      if (!room.open)
        return interaction.reply({ content: "❌ Không có ván", ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`bet_${interaction.customId}`)
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

    /* ===== MODAL ===== */
    if (interaction.isModalSubmit()) {
      const choice = interaction.customId.split("_")[1];
      const amount = parseInt(interaction.fields.getTextInputValue("amount"));
      const user = getUser(interaction.user.id);

      if (isNaN(amount) || amount <= 0)
        return interaction.reply({ content: "❌ Số coin không hợp lệ", ephemeral: true });

      if (user.coin < amount)
        return interaction.reply({ content: "❌ Không đủ coin", ephemeral: true });

      user.coin -= amount;
      room.bets[interaction.user.id] = { choice, amount };
      save();

      return interaction.reply({ content: "✅ Đã đặt cược", ephemeral: true });
    }

  } catch (e) {
    console.error(e);
  }
});

/* ================= ROLL ================= */
async function rollDice() {
  const d1 = rand(), d2 = rand(), d3 = rand();
  const total = d1 + d2 + d3;
  const isTai = total >= 11;

  let text =
    `🎲 **KẾT QUẢ**\n` +
    `${diceEmoji(d1)} ${diceEmoji(d2)} ${diceEmoji(d3)} = **${total}**\n` +
    `👉 **${isTai ? "TÀI" : "XỈU"}**\n\n`;

  for (const uid in room.bets) {
    const bet = room.bets[uid];
    const user = getUser(uid);
    if (
      (bet.choice === "tai" && isTai) ||
      (bet.choice === "xiu" && !isTai)
    ) {
      user.coin += bet.amount * 2;
      text += `🎉 <@${uid}> thắng +${bet.amount}\n`;
    } else {
      text += `💀 <@${uid}> thua -${bet.amount}\n`;
    }
  }

  save();
  room.open = false;
  await room.channel.send(text);
}

function rand() {
  return Math.floor(Math.random() * 6) + 1;
}

client.login(TOKEN);
