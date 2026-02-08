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

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

/* ================= DATA ================= */
const DATA_FILE = "./data.json";
let data = fs.existsSync(DATA_FILE)
  ? JSON.parse(fs.readFileSync(DATA_FILE))
  : { users: {} };

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function getUser(id) {
  if (!data.users[id]) data.users[id] = { coin: 0, lastDaily: 0 };
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
let taiXiuRoom = { open:false, bets:{}, msg:null, time:0 };
let bauCuaRoom = { open:false, bets:{}, msg:null, time:0 };

/* ================= READY ================= */
client.once("ready", async () => {
  console.log("✅ Bot online");

  const cmds = [
    new SlashCommandBuilder().setName("taixiu").setDescription("🎲 Mở Tài Xỉu"),
    new SlashCommandBuilder().setName("baucuo").setDescription("🎴 Mở Bầu Cua"),
    new SlashCommandBuilder().setName("sodu").setDescription("💳 Xem số dư"),
    new SlashCommandBuilder()
      .setName("chuyencoin")
      .setDescription("💸 Chuyển coin")
      .addUserOption(o=>o.setName("user").setRequired(true))
      .addIntegerOption(o=>o.setName("amount").setRequired(true))
  ].map(c=>c.toJSON());

  const rest = new REST({version:"10"}).setToken(TOKEN);
  await rest.put(Routes.applicationCommands(client.user.id), { body: cmds });
});

/* ================= INTERACTION ================= */
client.on("interactionCreate", async i => {
  try {
    /* ===== SLASH ===== */
    if (i.isChatInputCommand()) {
      await i.deferReply();

      if (i.commandName === "sodu")
        return i.editReply(`💳 **${getUser(i.user.id).coin} coin**`);

      if (i.commandName === "chuyencoin") {
        const to=i.options.getUser("user");
        const a=i.options.getInteger("amount");
        if (a<=0||getUser(i.user.id).coin<a)
          return i.editReply("❌ Không đủ coin");

        getUser(i.user.id).coin-=a;
        getUser(to.id).coin+=a;
        save();
        return i.editReply(`💸 Đã chuyển ${a} coin`);
      }

      /* ===== TÀI XỈU ===== */
      if (i.commandName==="taixiu") {
        if (taiXiuRoom.open) return i.editReply("⏳ Đang có ván");

        taiXiuRoom={open:true,bets:{},time:45};

        const row=new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("tx_tai").setLabel("🎲 TÀI").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId("tx_xiu").setLabel("🎲 XỈU").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("tx_chan").setLabel("➗ CHẴN").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("tx_le").setLabel("➗ LẺ").setStyle(ButtonStyle.Primary)
        );

        taiXiuRoom.msg = await i.editReply({content:"🎲 **TÀI XỈU**\n⏳ 45s",components:[row]});
        startTaiXiu();
      }

      /* ===== BẦU CUA ===== */
      if (i.commandName==="baucuo") {
        if (bauCuaRoom.open) return i.editReply("⏳ Đang có ván");

        bauCuaRoom={open:true,bets:{},time:45};

        const row=new ActionRowBuilder().addComponents(
          ...animals.map(a =>
            new ButtonBuilder()
              .setCustomId(`bc_${a.id}`)
              .setLabel(`${a.emoji} ${a.name}`)
              .setStyle(ButtonStyle.Primary)
          )
        );

        bauCuaRoom.msg = await i.editReply({content:"🎴 **BẦU CUA**\n⏳ 45s",components:[row]});
        startBauCua();
      }
    }

    /* ===== BUTTON ===== */
    if (i.isButton()) {
      const modal=new ModalBuilder()
        .setCustomId(`bet_${i.customId}`)
        .setTitle("Nhập coin cược")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId("amount")
              .setLabel("Coin")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );
      return i.showModal(modal);
    }

    /* ===== MODAL ===== */
    if (i.isModalSubmit()) {
      const a=parseInt(i.fields.getTextInputValue("amount"));
      if (a<=0||getUser(i.user.id).coin<a)
        return i.reply({content:"❌ Coin không hợp lệ",ephemeral:true});

      getUser(i.user.id).coin-=a;
      const id=i.customId.replace("bet_","");
      if (id.startsWith("tx_")) taiXiuRoom.bets[i.user.id]={type:id,amount:a};
      else bauCuaRoom.bets[i.user.id]={animal:id,amount:a};
      save();
      return i.reply({content:"✅ Đã đặt cược",ephemeral:true});
    }

  } catch(e){ console.error(e); }
});

/* ================= LOGIC ================= */
function startTaiXiu(){
  const t=setInterval(async()=>{
    taiXiuRoom.time--;
    if(taiXiuRoom.time<=0){
      clearInterval(t);
      const d=[r(),r(),r()];
      const total=d.reduce((a,b)=>a+b,0);
      const isTai=total>=11,isChan=total%2===0;

      let txt=`🎲 **KẾT QUẢ**\n${d.map(x=>diceEmoji[x-1]).join(" ")} = **${total}**\n\n`;
      for(const uid in taiXiuRoom.bets){
        const b=taiXiuRoom.bets[uid];
        const win=
          (b.type==="tx_tai"&&isTai)||
          (b.type==="tx_xiu"&&!isTai)||
          (b.type==="tx_chan"&&isChan)||
          (b.type==="tx_le"&&!isChan);
        if(win){getUser(uid).coin+=b.amount*2;txt+=`🎉 <@${uid}> thắng\n`}
        else txt+=`💀 <@${uid}> thua\n`;
      }
      save(); taiXiuRoom.open=false;
      taiXiuRoom.msg.edit({content:txt,components:[]});
    }
  },1000);
}

function startBauCua(){
  const t=setInterval(async()=>{
    bauCuaRoom.time--;
    if(bauCuaRoom.time<=0){
      clearInterval(t);
      const rs=[0,0,0].map(()=>animals[Math.floor(Math.random()*animals.length)]);
      let txt=`🎴 **KẾT QUẢ**\n${rs.map(x=>x.emoji).join(" ")}\n\n`;

      for(const uid in bauCuaRoom.bets){
        const b=bauCuaRoom.bets[uid];
        const hit=rs.filter(x=>`bc_${x.id}`===b.animal).length;
        if(hit>0){getUser(uid).coin+=b.amount*(hit+1);txt+=`🎉 <@${uid}> trúng\n`}
        else txt+=`💀 <@${uid}> thua\n`;
      }
      save(); bauCuaRoom.open=false;
      bauCuaRoom.msg.edit({content:txt,components:[]});
    }
  },1000);
}

const r=()=>Math.floor(Math.random()*6)+1;
client.login(TOKEN);
