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

/* ================= BUCU (BAU CUA) ================= */
const BUCU = {
  nai: "🦌",
  bau: "🍐",
  ga: "🐓",
  ca: "🐟",
  cua: "🦀",
  tom: "🦐"
};
const BUCU_LIST = Object.keys(BUCU);

/* ================= ROOMS ================= */
let taiXiuRoom = {
  open: false,
  bets: {},
  message: null,
  time: 0,
  channel: null
};

let bucuRoom = {
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
    new SlashCommandBuilder().setName("bucu").setDescription("🎲 Mở ván Bầu Cua"),
    new SlashCommandBuilder().setName("sodu").setDescription("💳 Xem số dư"),
    new SlashCommandBuilder().setName("nhantien").setDescription("💰 Nhận 100 coin mỗi ngày"),
    new SlashCommandBuilder()
      .setName("addcoin")
      .setDescription("🛠 Admin cộng coin")
      .addUserOption(o => o.setName("user").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });

  console.log("✅ Slash commands registered");
});

/* ================= INTERACTION ================= */
client.on("interactionCreate", async interaction => {
  try {
    /* ===== SLASH ===== */
    if (interaction.isChatInputCommand()) {
      await interaction.deferReply();

      if (interaction.commandName === "sodu") {
        return interaction.editReply(`💳 **${getUser(interaction.user.id).coin} coin**`);
      }

      if (interaction.commandName === "nhantien") {
        const u = getUser(interaction.user.id);
        if (Date.now() - u.lastDaily < 86400000)
          return interaction.editReply("⏳ Hôm nay nhận rồi");
        u.coin += 100;
        u.lastDaily = Date.now();
        save();
        return interaction.editReply(`💰 +100 | Tổng: ${u.coin}`);
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

      /* ===== TAI XIU ===== */
      if (interaction.commandName === "taixiu") {
        if (taiXiuRoom.open)
          return interaction.editReply("⏳ Đang có ván Tài Xỉu");

        taiXiuRoom.open = true;
        taiXiuRoom.bets = {};
        taiXiuRoom.time = 45;
        taiXiuRoom.channel = interaction.channel;

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("tai").setLabel("🎲 Tài").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("xiu").setLabel("🎲 Xỉu").setStyle(ButtonStyle.Danger)
        );

        taiXiuRoom.message = await interaction.editReply({
          content: `🎰 **TÀI XỈU**\n🎲 ??? ??? ???\n⏳ **45s**`,
          components: [row]
        });

        const timer = setInterval(async () => {
          taiXiuRoom.time--;
          if (taiXiuRoom.time === 0) {
            taiXiuRoom.open = false;
            clearInterval(timer);

            const disabled = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("tai").setLabel("🎲 Tài").setStyle(ButtonStyle.Success).setDisabled(true),
              new ButtonBuilder().setCustomId("xiu").setLabel("🎲 Xỉu").setStyle(ButtonStyle.Danger).setDisabled(true)
            );

            await taiXiuRoom.message.edit({
              content: `🎰 **TÀI XỈU**\n🎲 ĐANG LẮC...\n⛔ HẾT GIỜ`,
              components: [disabled]
            });

            return rollTaiXiu();
          }

          taiXiuRoom.message.edit({
            content: `🎰 **TÀI XỈU**\n🎲 ??? ??? ???\n⏳ **${taiXiuRoom.time}s**`,
            components: [row]
          });
        }, 1000);
      }

      /* ===== BUCU ===== */
      if (interaction.commandName === "bucu") {
        if (bucuRoom.open)
          return interaction.editReply("⏳ Đang có ván Bầu Cua");

        bucuRoom.open = true;
        bucuRoom.bets = {};
        bucuRoom.time = 45;
        bucuRoom.channel = interaction.channel;

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("bucu_nai").setLabel("🦌 NAI").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("bucu_bau").setLabel("🍐 BẦU").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("bucu_ga").setLabel("🐓 GÀ").setStyle(ButtonStyle.Primary)
        );

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("bucu_ca").setLabel("🐟 CÁ").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("bucu_cua").setLabel("🦀 CUA").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("bucu_tom").setLabel("🦐 TÔM").setStyle(ButtonStyle.Primary)
        );

        bucuRoom.message = await interaction.editReply({
          content: `🎰 **BẦU CUA**\n🎲 ??? ??? ???\n⏳ **45s**`,
          components: [row1, row2]
        });

        const timer = setInterval(async () => {
          bucuRoom.time--;
          if (bucuRoom.time === 0) {
            bucuRoom.open = false;
            clearInterval(timer);

            const d1 = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("bucu_nai").setLabel("🦌 NAI").setStyle(ButtonStyle.Primary).setDisabled(true),
              new ButtonBuilder().setCustomId("bucu_bau").setLabel("🍐 BẦU").setStyle(ButtonStyle.Primary).setDisabled(true),
              new ButtonBuilder().setCustomId("bucu_ga").setLabel("🐓 GÀ").setStyle(ButtonStyle.Primary).setDisabled(true)
            );

            const d2 = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId("bucu_ca").setLabel("🐟 CÁ").setStyle(ButtonStyle.Primary).setDisabled(true),
              new ButtonBuilder().setCustomId("bucu_cua").setLabel("🦀 CUA").setStyle(ButtonStyle.Primary).setDisabled(true),
              new ButtonBuilder().setCustomId("bucu_tom").setLabel("🦐 TÔM").setStyle(ButtonStyle.Primary).setDisabled(true)
            );

            await bucuRoom.message.edit({
              content: `🎰 **BẦU CUA**\n🎲 ĐANG LẮC...\n⛔ HẾT GIỜ`,
              components: [d1, d2]
            });

            return rollBucu();
          }

          bucuRoom.message.edit({
            content: `🎰 **BẦU CUA**\n🎲 ??? ??? ???\n⏳ **${bucuRoom.time}s**`,
            components: [row1, row2]
          });
        }, 1000);
      }
    }

    /* ===== BUTTON ===== */
    if (interaction.isButton()) {
      if ((interaction.customId === "tai" || interaction.customId === "xiu") && !taiXiuRoom.open)
        return interaction.reply({ content: "⛔ Hết thời gian cược", ephemeral: true });

      if (interaction.customId.startsWith("bucu_") && !bucuRoom.open)
        return interaction.reply({ content: "⛔ Hết thời gian cược", ephemeral: true });

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

      return interaction.showModal(modal);
    }

    /* ===== MODAL ===== */
    if (interaction.isModalSubmit()) {
      const amount = parseInt(interaction.fields.getTextInputValue("amount"));
      const user = getUser(interaction.user.id);

      if (isNaN(amount) || amount <= 0)
        return interaction.reply({ content: "❌ Coin không hợp lệ", ephemeral: true });
      if (user.coin < amount)
        return interaction.reply({ content: "❌ Không đủ coin", ephemeral: true });

      user.coin -= amount;

      if (interaction.customId === "bet_tai" || interaction.customId === "bet_xiu") {
        taiXiuRoom.bets[interaction.user.id] = {
          choice: interaction.customId.split("_")[1],
          amount
        };
      }

      if (interaction.customId.startsWith("bet_bucu_")) {
        bucuRoom.bets[interaction.user.id] = {
          choice: interaction.customId.split("_")[2],
          amount
        };
      }

      save();
      return interaction.reply({ content: "✅ Đã đặt cược", ephemeral: true });
    }
  } catch (e) {
    console.error(e);
  }
});

/* ================= ROLL ================= */
function rand() {
  return Math.floor(Math.random() * 6) + 1;
}

async function rollTaiXiu() {
  const d1 = rand(), d2 = rand(), d3 = rand();
  const total = d1 + d2 + d3;
  const isTai = total >= 11;

  let text =
    `🎲 **KẾT QUẢ TÀI XỈU**\n` +
    `${diceEmoji(d1)} ${diceEmoji(d2)} ${diceEmoji(d3)} = **${total}**\n` +
    `👉 **${isTai ? "TÀI" : "XỈU"}**\n\n`;

  for (const uid in taiXiuRoom.bets) {
    const bet = taiXiuRoom.bets[uid];
    const user = getUser(uid);
    if ((bet.choice === "tai" && isTai) || (bet.choice === "xiu" && !isTai)) {
      user.coin += bet.amount * 2;
      text += `🎉 <@${uid}> thắng +${bet.amount}\n`;
    } else {
      text += `💀 <@${uid}> thua -${bet.amount}\n`;
    }
  }

  save();
  await taiXiuRoom.channel.send(text);
}

async function rollBucu() {
  const result = [
    BUCU_LIST[rand() - 1],
    BUCU_LIST[rand() - 1],
    BUCU_LIST[rand() - 1]
  ];

  let text =
    `🎲 **KẾT QUẢ BẦU CUA**\n` +
    `${BUCU[result[0]]} ${BUCU[result[1]]} ${BUCU[result[2]]}\n\n`;

  for (const uid in bucuRoom.bets) {
    const bet = bucuRoom.bets[uid];
    const user = getUser(uid);
    const count = result.filter(r => r === bet.choice).length;

    if (count > 0) {
      const win = bet.amount * (count + 1);
      user.coin += win;
      text += `🎉 <@${uid}> trúng **${count}** → +${win}\n`;
    } else {
      text += `💀 <@${uid}> thua -${bet.amount}\n`;
    }
  }

  save();
  await bucuRoom.channel.send(text);
}

/* ================= LOGIN ================= */
client.login(TOKEN);
