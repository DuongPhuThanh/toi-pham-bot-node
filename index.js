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

/* ================= DICE EMOJI (SERVER EMOJI) ================= */
const DICE = {
  1: "<:dice1:1470461068836077740>",
  2: "<:dice2:1470461090197410095>",
  3: "<:dice3:1470461110040662217>",
  4: "<:dice4:1470461130064400495>",
  5: "<:dice5:1470461150578610339>",
  6: "<:dice6:1470461041145151582>"
};

function diceEmoji(n) {
  return DICE[n] || "❓";
}

/* ================= ROOM ================= */
let room = {
  open: false,
  bets: {},
  message: null,
  channel: null,
  time: 0
};

/* ================= READY ================= */
client.once("ready", async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder().setName("taixiu").setDescription("🎲 Mở ván Tài Xỉu"),
    new SlashCommandBuilder().setName("nhantien").setDescription("💰 Nhận 100 coin mỗi ngày"),
    new SlashCommandBuilder().setName("sodu").setDescription("💳 Xem số dư"),
    new SlashCommandBuilder()
      .setName("chuyencoin")
      .setDescription("💸 Chuyển coin")
      .addUserOption(o => o.setName("user").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setRequired(true)),
    new SlashCommandBuilder()
      .setName("addcoin")
      .setDescription("🛠 Admin")
      .addUserOption(o => o.setName("user").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

/* ================= INTERACTION ================= */
client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await interaction.deferReply();

      if (interaction.commandName === "taixiu") {
        if (room.open) return interaction.editReply("⏳ Đang có ván");

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
            `⏳ Còn 45s để đặt cược\n\n` +
            `${diceEmoji(1)} ${diceEmoji(2)} ${diceEmoji(3)}`,
          components: [row]
        });

        const timer = setInterval(async () => {
          room.time--;
          if (room.time <= 0) {
            clearInterval(timer);
            rollDice();
            return;
          }

          room.message.edit(
            `🎰 **TÀI XỈU**\n` +
            `⏳ Còn ${room.time}s để đặt cược\n\n` +
            `${diceEmoji(1)} ${diceEmoji(2)} ${diceEmoji(3)}`
          );
        }, 1000);
      }
    }

    if (interaction.isButton()) {
      if (!room.open) return interaction.reply({ content: "❌ Không có ván", ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`bet_${interaction.customId}`)
        .setTitle("Nhập coin cược")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("amount")
              .setLabel("Số coin")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

      interaction.showModal(modal);
    }

    if (interaction.isModalSubmit()) {
      const choice = interaction.customId.split("_")[1];
      const amount = parseInt(interaction.fields.getTextInputValue("amount"));
      const user = getUser(interaction.user.id);

      if (amount <= 0 || user.coin < amount)
        return interaction.reply({ content: "❌ Không hợp lệ", ephemeral: true });

      user.coin -= amount;
      room.bets[interaction.user.id] = { choice, amount };
      save();

      interaction.reply({ content: "✅ Đã đặt cược", ephemeral: true });
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

  let result =
    `🎲 **KẾT QUẢ**\n\n` +
    `${diceEmoji(d1)} ${diceEmoji(d2)} ${diceEmoji(d3)} = **${total}**\n` +
    `👉 **${isTai ? "TÀI" : "XỈU"}**\n\n`;

  let summary = `📊 **TỔNG KẾT**\n`;

  for (const uid in room.bets) {
    const bet = room.bets[uid];
    const user = getUser(uid);
    const win =
      (bet.choice === "tai" && isTai) ||
      (bet.choice === "xiu" && !isTai);

    if (win) {
      user.coin += bet.amount * 2;
      summary += `🎉 <@${uid}> thắng +${bet.amount}\n`;
    } else {
      summary += `💀 <@${uid}> thua -${bet.amount}\n`;
    }
  }

  save();
  room.open = false;

  await room.message.edit(result);
  await room.channel.send(summary);
}

function rand() {
  return Math.floor(Math.random() * 6) + 1;
}

client.login(TOKEN);
