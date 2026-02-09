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
      .addUserOption(o => o.setName("user").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setRequired(true)),
    new SlashCommandBuilder()
      .setName("addcoin")
      .setDescription("🛠 Admin cộng coin")
      .addUserOption(o => o.setName("user").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setRequired(true))
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

/* ================= INTERACTION ================= */
client.on("interactionCreate", async interaction => {
  try {

    /* ===== CHUYỂN COIN ===== */
    if (interaction.isChatInputCommand() && interaction.commandName === "chuyencoin") {
      const to = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");
      const from = getUser(interaction.user.id);

      if (amount <= 0 || from.coin < amount)
        return interaction.reply({ content: "❌ Không hợp lệ", ephemeral: true });

      from.coin -= amount;
      getUser(to.id).coin += amount;
      save();

      return interaction.reply(
        `💸 **CHUYỂN COIN THÀNH CÔNG**\n👤 <@${to.id}>\n💰 ${amount}\n💳 Còn: ${from.coin}`
      );
    }

    /* ===== TÀI XỈU (FIX TRIỆT ĐỂ) ===== */
    if (interaction.isChatInputCommand() && interaction.commandName === "taixiu") {
      if (room.open)
        return interaction.reply({ content: "⏳ Đang có ván khác", ephemeral: true });

      await interaction.deferReply(); // 🔥 FIX CHÍNH

      room.open = true;
      room.bets = {};
      room.time = 45;
      room.channel = interaction.channel;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("tai").setLabel("🎲 Tài").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("xiu").setLabel("🎲 Xỉu").setStyle(ButtonStyle.Danger)
      );

      room.message = await interaction.editReply({
        content: `🎰 **TÀI XỈU**\n🎲 🎲 🎲\n⏳ 45s`,
        components: [row]
      });

      const timer = setInterval(async () => {
        room.time--;
        if (room.time <= 0) {
          clearInterval(timer);
          await rollDice();
          return;
        }
        await room.message.edit({
          content: `🎰 **TÀI XỈU**\n🎲 🎲 🎲\n⏳ ${room.time}s`,
          components: [row]
        });
      }, 1000);
      return;
    }

    /* ===== LỆNH NHẸ ===== */
    if (interaction.isChatInputCommand()) {
      await interaction.deferReply();

      if (interaction.commandName === "sodu")
        return interaction.editReply(`💳 ${getUser(interaction.user.id).coin} coin`);

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

      /* ===== BẦU CUA ===== */
      if (interaction.commandName === "baucua") {
        if (baucua.open)
          return interaction.editReply("⏳ Đang có ván khác");

        baucua.open = true;
        baucua.bets = {};
        baucua.time = 45;
        baucua.channel = interaction.channel;

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("bau").setLabel("🍐").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("cua").setLabel("🦀").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("tom").setLabel("🦐").setStyle(ButtonStyle.Primary)
        );
        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ca").setLabel("🐟").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("ga").setLabel("🐓").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("nai").setLabel("🦌").setStyle(ButtonStyle.Primary)
        );

        baucua.message = await interaction.editReply({
          content: `🎰 **BẦU CUA**\n🍐 🦀 🦐 🐟 🐓 🦌\n⏳ 45s`,
          components: [row1, row2]
        });

        const timer = setInterval(async () => {
          baucua.time--;
          if (baucua.time <= 0) {
            clearInterval(timer);
            await rollBauCua();
            return;
          }
          await baucua.message.edit({
            content: `🎰 **BẦU CUA**\n🍐 🦀 🦐 🐟 🐓 🦌\n⏳ ${baucua.time}s`,
            components: [row1, row2]
          });
        }, 1000);
      }
    }

    /* ===== BUTTON + MODAL BẦU CUA ===== */
    if (interaction.isButton() && baucua.open && BAUCUA_KEYS.includes(interaction.customId)) {
      const modal = new ModalBuilder()
        .setCustomId(`baucua_${interaction.customId}`)
        .setTitle("Nhập coin")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("amount").setLabel("Coin").setStyle(TextInputStyle.Short)
          )
        );
      return interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith("baucua_")) {
      const choice = interaction.customId.split("_")[1];
      const amount = parseInt(interaction.fields.getTextInputValue("amount"));
      const user = getUser(interaction.user.id);

      if (amount <= 0 || user.coin < amount)
        return interaction.reply({ content: "❌ Không hợp lệ", ephemeral: true });

      user.coin -= amount;
      baucua.bets[interaction.user.id] = { choice, amount };
      save();
      return interaction.reply({ content: "✅ Đã cược", ephemeral: true });
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

  let text = `🎲 **KẾT QUẢ**\n${diceEmoji(d1)} ${diceEmoji(d2)} ${diceEmoji(d3)} = ${total}\n`;

  for (const uid in room.bets) {
    const bet = room.bets[uid];
    const user = getUser(uid);
    if ((bet.choice === "tai" && isTai) || (bet.choice === "xiu" && !isTai)) {
      user.coin += bet.amount * 2;
      text += `🎉 <@${uid}> +${bet.amount}\n`;
    }
  }
  save();
  room.open = false;
  await room.channel.send(text);
}

async function rollBauCua() {
  const r = [BAUCUA_KEYS[rand()-1], BAUCUA_KEYS[rand()-1], BAUCUA_KEYS[rand()-1]];
  let text = `🎲 **KẾT QUẢ BẦU CUA**\n${r.map(x=>BAUCUA[x]).join(" ")}\n`;

  for (const uid in baucua.bets) {
    const bet = baucua.bets[uid];
    const user = getUser(uid);
    const count = r.filter(x=>x===bet.choice).length;
    if (count > 0) {
      user.coin += bet.amount * (count + 1);
      text += `🎉 <@${uid}> trúng ${count}\n`;
    }
  }
  save();
  baucua.open = false;
  await baucua.channel.send(text);
}

function rand() {
  return Math.floor(Math.random() * 6) + 1;
}

client.login(TOKEN);
