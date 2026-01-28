// index.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const { findStudentSectionP, findStudentAffectation } = require('./excel');

const USED_IDS_PATH = path.join(__dirname, 'used-ids.json');
const CYBER_LOGS_PATH = path.join(__dirname, 'cyber-verif-logs.json');

// IDs des serveurs
const GUILD_ID_1 = '1451338534467141765'; // serveur 1 (section A / B)
const GUILD_ID_2 = '1451573366833025210'; // serveur 2 (Cyber / Autres)

// Charger used-ids.json (log global)
let usedIds = [];
try {
  usedIds = JSON.parse(fs.readFileSync(USED_IDS_PATH, 'utf8'));
  if (!Array.isArray(usedIds)) usedIds = [];
} catch (err) {
  usedIds = [];
}

// Charger cyber-verif-logs.json (log serveur 2)
let cyberLogs = [];
try {
  cyberLogs = JSON.parse(fs.readFileSync(CYBER_LOGS_PATH, 'utf8'));
  if (!Array.isArray(cyberLogs)) cyberLogs = [];
} catch (err) {
  cyberLogs = [];
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.once('ready', () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (message.channel.name !== 'verification') return;

  const matricule = message.content.trim();
  if (!matricule) return;

  // Log global dans used-ids.json (les deux serveurs)
  usedIds.push({
    id: matricule,
    userId: message.author.id,
    username: `${message.author.username}#${message.author.discriminator}`,
    guildId: message.guild.id,
    timestamp: new Date().toISOString()
  });
  try {
    fs.writeFileSync(USED_IDS_PATH, JSON.stringify(usedIds, null, 2));
  } catch (err) {
    console.error('Erreur lors de l\'écriture de used-ids.json:', err);
  }

  // Dispatcher selon le serveur
  if (message.guild.id === GUILD_ID_1) {
    await handleServer1(message, matricule);
  } else if (message.guild.id === GUILD_ID_2) {
    await handleServer2(message, matricule);
  }
});

// ---------- Logique serveur 1 ----------
async function handleServer1(message, matricule) {
  const sectionP = findStudentSectionP(matricule);
  console.log('[Srv1] Matricule reçu:', matricule, '→ SectionP trouvée:', sectionP);

  if (sectionP === null) {
    await message.reply("ID doesn't exist, check your ID and try again l3ziz.");
    return;
  }

  const roleSectionA = message.guild.roles.cache.find(r => r.name === 'section A');
  const roleSectionB = message.guild.roles.cache.find(r => r.name === 'section B / other option');
  const roleDouane  = message.guild.roles.cache.find(r => r.name === 'La douane');

  if (!roleSectionA || !roleSectionB) {
    await message.reply("Les rôles `section A` ou `section B / other option` n'existent pas sur ce serveur.");
    return;
  }

  const member = await message.guild.members.fetch(message.author.id);
  await member.roles.remove([roleSectionA, roleSectionB]).catch(() => {});

  if (sectionP === 'A') {
    console.log('[Srv1] Case: SectionP === A -> section A');
    await member.roles.add(roleSectionA);
    if (roleDouane) await member.roles.remove(roleDouane);
    await message.reply("You are welcome to **section A** l3ziz.");
  } else {
    console.log('[Srv1] Case: SectionP !== A -> section B');
    await member.roles.add(roleSectionB);
    if (roleDouane) await member.roles.remove(roleDouane);
    await message.reply("You have been added to **section B / other option**, you are welcome here l3ziz.");
  }
}

// ---------- Logique serveur 2 ----------
async function handleServer2(message, matricule) {
  const affect = findStudentAffectation(matricule);
  console.log('[Srv2] Matricule reçu:', matricule, '→ Affectation trouvée:', affect);

  if (affect === null) {
    await message.reply("ID doesn't exist, check your ID and try again.");
    return;
  }

  const roleCyber    = message.guild.roles.cache.find(r => r.name === 'Cyber');
  const roleAutres   = message.guild.roles.cache.find(r => r.name === 'Autre option');
  const roleNonVerif = message.guild.roles.cache.find(r => r.name === 'Non-vérifié → ❌');

  if (!roleCyber || !roleAutres) {
    await message.reply("Les rôles `Cyber` ou `Autres` n'existent pas sur ce serveur.");
    return;
  }

  const member = await message.guild.members.fetch(message.author.id);
  await member.roles.remove([roleCyber, roleAutres]).catch(() => {});

  const targetAffect = "Sécurité Informatique  -  Administration Clients/Serveurs";

  let resultRole = 'Autres';

  if (affect === targetAffect) {
    console.log('[Srv2] Case: Affectation = Sécurité -> Cyber');
    await member.roles.add(roleCyber);
    resultRole = 'Cyber';
    if (roleNonVerif) await member.roles.remove(roleNonVerif);
    await message.reply("You have been added to **Cyber**.");
  } else {
    console.log('[Srv2] Case: Affectation != Sécurité -> Autres');
    await member.roles.add(roleAutres);
    if (roleNonVerif) await member.roles.remove(roleNonVerif);
    await message.reply("You have been added to **Autres**.");
  }

  // Log spécifique serveur 2 dans cyber-verif-logs.json
  cyberLogs.push({
    id: matricule,
    userId: message.author.id,
    username: `${message.author.username}#${message.author.discriminator}`,
    affectation: affect,
    assignedRole: resultRole,
    timestamp: new Date().toISOString()
  });

  try {
    fs.writeFileSync(CYBER_LOGS_PATH, JSON.stringify(cyberLogs, null, 2));
  } catch (err) {
    console.error('Erreur lors de l\'écriture de cyber-verif-logs.json:', err);
  }
}

client.login(process.env.TOKEN);