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

/* ================= EMOJI ================= */
const diceEmoji = ["⚀","⚁","⚂","⚃","⚄","⚅"];

const animals = [
  { id: "ca", name: "CÁ", emoji: "🐟" },
  { id: "cua", name: "CUA", emoji: "🦀" },
  { id: "ga", name: "GÀ", emoji: "🐓" },
  { id: "vit", name: "VỊT", emoji: "🦆" },
  { id: "nai", name: "NAI", emoji: "🦌" },
  { id: "cho", name: "CHÓ", emoji: "🐕" },
  { id: "meo", name: "MÈO", emoji: "🐈" }
];

/* ================= ROOMS ================= */
let taiXiuRoom = { open:false, bets:{}, message:null, time:0 };
let bauCuaRoom = { open:false, bets:{}, message:null, time:0 };

/* ================= COMMAND REGISTER ================= */
client.once("ready", async () => {
  console.log(`✅ Bot online: ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder().setName("taixiu").setDescription("🎲 Mở ván Tài Xỉu"),
    new SlashCommandBuilder().setName("baucuo").setDescription("🎴 Mở ván Bầu Cua"),
    new SlashCommandBuilder().setName("sodu").setDescription("💳 Xem số dư"),
    new SlashCommandBuilder()
      .setName("chuyencoin")
      .setDescription("💸 Chuyển coin")
      .addUserOption(o => o.setName("user").setRequired(true))
      .addIntegerOption(o => o.setName("amount").setRequired(true))
  ].map(c=>c.toJSON());

  const rest = new REST({version:"10"}).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
});

/* ================= INTERACTION ================= */
client.on("interactionCreate", async interaction => {
  try {

    if (interaction.isChatInputCommand()) {
      await interaction.deferReply();

      if (interaction.commandName==="sodu")
        return interaction.editReply(`💳 Số dư: **${getUser(interaction.user.id).coin} coin**`);

      if (interaction.commandName==="chuyencoin") {
        const to = interaction.options.getUser("user");
        const amount = interaction.options.getInteger("amount");
        const from = getUser(interaction.user.id);

        if (amount<=0 || from.coin<amount)
          return interaction.editReply("❌ Không đủ coin");

        from.coin-=amount;
        getUser(to.id).coin+=amount;
        save();
        return interaction.editReply(`💸 Đã chuyển **${amount} coin** cho <@${to.id}>`);
      }

      if (interaction.commandName==="taixiu") {
        if (taiXiuRoom.open) return interaction.editReply("⏳ Đang có ván");
        taiXiuRoom={open:true,bets:{},time:45,message:null};

        const row=new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("tx_tai").setLabel("🎲 TÀI").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("tx_xiu").setLabel("🎲 XỈU").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("tx_chan").setLabel("➗ CHẴN").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("tx_le").setLabel("➗ LẺ").setStyle(ButtonStyle.Primary)
        );

        taiXiuRoom.message=await interaction.editReply({
          content:"🎲 **TÀI XỈU**\n🎲 Đang mở cược...",
          components:[row]
        });

        startTaiXiu();
      }

      if (interaction.commandName==="baucuo") {
        if (bauCuaRoom.open) return interaction.editReply("⏳ Đang có ván");
        bauCuaRoom={open:true,bets:{},time:45,message:null};

        const row=new ActionRowBuilder().addComponents(
          animals.map(a=>new ButtonBuilder()
            .setCustomId(`bc_${a.id}`)
            .setLabel(`${a.emoji} ${a.name}`)
            .setStyle(ButtonStyle.Primary))
        );

        bauCuaRoom.message=await interaction.editReply({
          content:"🎴 **BẦU CUA**\n🎴 Đang mở cược...",
          components:[row]
        });

        startBauCua();
      }
    }

    if (interaction.isButton()) {
      const modal=new ModalBuilder()
        .setCustomId(`bet_${interaction.customId}`)
        .setTitle("Nhập coin cược");

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
      const amount=parseInt(interaction.fields.getTextInputValue("amount"));
      const user=getUser(interaction.user.id);

      if (isNaN(amount)||amount<=0||user.coin<amount)
        return interaction.reply({content:"❌ Coin không hợp lệ",ephemeral:true});

      user.coin-=amount;
      save();

      const id=interaction.customId.replace("bet_","");
      if (id.startsWith("tx_")) taiXiuRoom.bets[interaction.user.id]={type:id,amount};
      else bauCuaRoom.bets[interaction.user.id]={animal:id,amount};

      return interaction.reply({content:"✅ Đã đặt cược",ephemeral:true});
    }

  } catch(e){console.error(e);}
});

/* ================= TÀI XỈU – ANIMATION ================= */
function startTaiXiu(){
  const interval=setInterval(async()=>{
    taiXiuRoom.time--;

    const fake=[rand(),rand(),rand()];
    await taiXiuRoom.message.edit(
      `🎲 **TÀI XỈU**\n🎲 ${fake.map(x=>diceEmoji[x-1]).join(" ")}\n⏳ ${taiXiuRoom.time}s`
    );

    if(taiXiuRoom.time<=0){
      clearInterval(interval);

      const d=[rand(),rand(),rand()];
      const total=d.reduce((a,b)=>a+b,0);
      const isTai=total>=11;
      const isChan=total%2===0;

      let text=`🎲 **KẾT QUẢ**\n🎲 ${d.map(x=>diceEmoji[x-1]).join(" ")} = **${total}**\n👉 ${isTai?"TÀI":"XỈU"} | ${isChan?"CHẴN":"LẺ"}\n\n`;

      for(const uid in taiXiuRoom.bets){
        const b=taiXiuRoom.bets[uid];
        const win=
          (b.type==="tx_tai"&&isTai)||
          (b.type==="tx_xiu"&&!isTai)||
          (b.type==="tx_chan"&&isChan)||
          (b.type==="tx_le"&&!isChan);

        if(win){getUser(uid).coin+=b.amount*2;text+=`🎉 <@${uid}> +${b.amount}\n`;}
        else text+=`💀 <@${uid}> -${b.amount}\n`;
      }

      save();
      taiXiuRoom.open=false;
      taiXiuRoom.message.edit({content:text,components:[]});
    }
  },1000);
}

/* ================= BẦU CUA – ANIMATION ================= */
function startBauCua(){
  const interval=setInterval(async()=>{
    bauCuaRoom.time--;

    const fake=[0,0,0].map(()=>animals[Math.floor(Math.random()*animals.length)]);
    await bauCuaRoom.message.edit(
      `🎴 **BẦU CUA**\n${fake.map(f=>f.emoji).join(" ")}\n⏳ ${bauCuaRoom.time}s`
    );

    if(bauCuaRoom.time<=0){
      clearInterval(interval);

      const result=[0,0,0].map(()=>animals[Math.floor(Math.random()*animals.length)]);
      let text=`🎴 **KẾT QUẢ**\n${result.map(r=>r.emoji).join(" ")}\n\n`;

      for(const uid in bauCuaRoom.bets){
        const b=bauCuaRoom.bets[uid];
        const hit=result.filter(r=>`bc_${r.id}`===b.animal).length;

        if(hit>0){
          getUser(uid).coin+=b.amount*(hit+1);
          text+=`🎉 <@${uid}> trúng ${hit}\n`;
        } else text+=`💀 <@${uid}> thua ${b.amount}\n`;
      }

      save();
      bauCuaRoom.open=false;
      bauCuaRoom.message.edit({content:text,components:[]});
    }
  },1000);
}

function rand(){return Math.floor(Math.random()*6)+1;}
client.login(TOKEN);
