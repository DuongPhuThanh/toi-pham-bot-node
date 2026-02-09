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

/* ================= SERVER DICE EMOJI ================= */
// ❗ PHẢI TỒN TẠI TRONG SERVER
function diceEmoji(n) {
  return `<:dice${n}:>`; // dice1 -> dice6
}

// 🎰 FRAME QUAY GIẢ
const diceFrames = [
  "<:dice1:> <:dice2:> <:dice3:>",
  "<:dice4:> <:dice5:> <:dice6:>",
  "<:dice6:> <:dice4:> <:dice2:>",
  "<:dice3:> <:dice1:> <:dice5:>",
  "<:dice2:> <:dice6:> <:dice4:>"
];

/* ================= TÀI XỈU ROOM ================= */
let room = {
  open: false,
  bets: {},
  message: null,
  time: 0
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
      .addUserOption(o => o.setName("user").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setRequired(true)),
    new SlashCommandBuilder()
      .setName("addcoin")
      .setDescription("🛠 Admin cộng tiền")
      .addUserOption(o => o.setName("user").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });

  console.log("✅ Slash commands registered");
});

/* ================= INTERACTION ================= */
client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      await interaction.deferReply();

      if (interaction.commandName === "sodu") {
        return interaction.editReply(
          `💳 **Số dư:** ${getUser(interaction.user.id).coin} coin`
        );
      }

      if (interaction.commandName === "taixiu") {
        if (room.open)
          return interaction.editReply("⏳ Đang có ván rồi");

        room.open = true;
        room.bets = {};
        room.time = 45;

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("tai").setLabel("🎲 Tài").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("xiu").setLabel("🎲 Xỉu").setStyle(ButtonStyle.Danger)
        );

        room.message = await interaction.editReply({
          content: "🎰 **TÀI XỈU**\n🎲 Đang quay...\n⏳ 45s",
          components: [row]
        });

        let frame = 0;

        const timer = setInterval(async () => {
          room.time--;

          if (room.time <= 0) {
            clearInterval(timer);
            await rollDice();
            return;
          }

          await room.message.edit({
            content:
              `🎰 **TÀI XỈU**\n` +
              `🎲 ${diceFrames[frame % diceFrames.length]}\n` +
              `⏳ Còn ${room.time}s`,
            components: room.message.components
          });

          frame++;
        }, 1000);
      }
    }

    if (interaction.isButton()) {
      if (!room.open)
        return interaction.reply({ content: "❌ Không có ván", ephemeral: true });

      const modal = new ModalBuilder()
        .setCustomId(`bet_${interaction.customId}`)
        .setTitle("Nhập coin");

      modal.addComponents(
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

    if (interaction.isModalSubmit()) {
      const choice = interaction.customId.split("_")[1];
      const amount = parseInt(interaction.fields.getTextInputValue("amount"));
      const user = getUser(interaction.user.id);

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
  // FAKE QUAY TRƯỚC KHI RA KẾT QUẢ
  for (let i = 0; i < 4; i++) {
    await room.message.edit(`🎰 **ĐANG QUAY...**\n🎲 ${diceFrames[i % diceFrames.length]}`);
    await new Promise(r => setTimeout(r, 700));
  }

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
    const win =
      (bet.choice === "tai" && isTai) ||
      (bet.choice === "xiu" && !isTai);

    if (win) {
      user.coin += bet.amount * 2;
      text += `🎉 <@${uid}> thắng +${bet.amount}\n`;
    } else {
      text += `💀 <@${uid}> thua -${bet.amount}\n`;
    }
  }

  save();
  room.open = false;
  await room.message.edit(text);
}

function rand() {
  return Math.floor(Math.random() * 6) + 1;
}

/* ================= LOGIN ================= */
client.login(TOKEN);
