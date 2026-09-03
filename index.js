// index.js — student verification bot.
//
// A student posts their matricule in #matricule. If it is in the roster
// (listeoptions.xlsx, read-only) they get the "spe" and "Student" roles.
// Otherwise they get an explanatory reply. Runs on every server the bot is in.
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const { findStudent, rosterSize } = require('./excel');

const LOG_PATH = path.join(__dirname, 'used-ids.json');

// Channel the bot listens in (exact name, no '#').
const VERIF_CHANNEL = 'matricule';

// Roles granted on a successful verification, in order.
const ROLES_TO_ADD = ['spe', 'Student'];

// A matricule is 8-15 digits. Anything else is treated as ordinary chatter
// and ignored, so normal conversation in the channel is not answered.
const MATRICULE_RE = /^\d{8,15}$/;

// ---------- verification log (append-only) ----------
let verifLog = [];
try {
  const parsed = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  if (Array.isArray(parsed)) verifLog = parsed;
} catch (err) {
  verifLog = []; // missing or empty file on first run
}

function appendLog(entry) {
  verifLog.push(entry);
  try {
    fs.writeFileSync(LOG_PATH, JSON.stringify(verifLog, null, 2));
  } catch (err) {
    console.error('[log] Écriture de used-ids.json impossible:', err.message);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

client.once('clientReady', () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
  console.log(`Roster: ${rosterSize()} matricules.`);
  console.log(`Serveurs (${client.guilds.cache.size}):`);
  for (const [, g] of client.guilds.cache) {
    console.log(`  - ${g.name} [${g.id}]`);
  }
  console.log(`En écoute dans #${VERIF_CHANNEL} sur chaque serveur.`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (message.channel.name !== VERIF_CHANNEL) return;

  const content = message.content.trim();
  if (!content) return;

  const where = `${message.guild.name}/#${message.channel.name}`;

  if (!MATRICULE_RE.test(content)) {
    console.log(`[${where}] Ignoré (pas un matricule): "${content.slice(0, 40)}"`);
    return;
  }

  const student = findStudent(content);

  // ----- not a student -----
  if (!student) {
    console.log(`[${where}] ${content} -> INTROUVABLE`);
    appendLog({
      matricule: content,
      userId: message.author.id,
      username: message.author.tag,
      guildId: message.guild.id,
      guildName: message.guild.name,
      result: 'not_found',
      timestamp: new Date().toISOString()
    });
    await message.reply(
      "❌ This ID is not in the student list. Check your matricule and try again — " +
      "if you are sure it is correct, contact an admin."
    ).catch(() => {});
    return;
  }

  // ----- verified student: assign roles -----
  const roles = await message.guild.roles.fetch().catch(() => null);
  if (!roles) {
    console.error(`[${where}] Impossible de lire les rôles.`);
    await message.reply("⚠️ I can't read the roles on this server. Please tell an admin.").catch(() => {});
    return;
  }

  const me = await message.guild.members.fetchMe();
  const found = [];
  const missing = [];
  const tooHigh = [];

  for (const name of ROLES_TO_ADD) {
    const role = roles.find(r => r.name === name);
    if (!role) missing.push(name);
    else if (role.position >= me.roles.highest.position) tooHigh.push(name);
    else found.push(role);
  }

  if (missing.length || tooHigh.length) {
    const problems = [
      missing.length ? `missing: ${missing.join(', ')}` : null,
      tooHigh.length ? `above my own role: ${tooHigh.join(', ')}` : null
    ].filter(Boolean).join(' | ');
    console.error(`[${where}] Problème de rôles -> ${problems}`);
  }

  let added = [];
  if (found.length) {
    try {
      const member = await message.guild.members.fetch(message.author.id);
      await member.roles.add(found);
      added = found.map(r => r.name);
    } catch (err) {
      console.error(`[${where}] Ajout de rôle échoué:`, err.message);
      await message.reply(
        "⚠️ You are verified, but I could not give you the role (permissions). Please tell an admin."
      ).catch(() => {});
      appendLog({
        matricule: student.matricule,
        name: student.name,
        userId: message.author.id,
        username: message.author.tag,
        guildId: message.guild.id,
        guildName: message.guild.name,
        result: 'role_error',
        error: err.message,
        timestamp: new Date().toISOString()
      });
      return;
    }
  }

  console.log(`[${where}] ${content} -> OK (${student.name}) rôles: ${added.join(', ') || 'aucun'}`);
  appendLog({
    matricule: student.matricule,
    name: student.name,
    userId: message.author.id,
    username: message.author.tag,
    guildId: message.guild.id,
    guildName: message.guild.name,
    result: 'verified',
    rolesAdded: added,
    rolesMissing: missing,
    timestamp: new Date().toISOString()
  });

  if (added.length) {
    await message.reply(`✅ Verified — welcome **${student.name}**! You now have: ${added.join(', ')}.`).catch(() => {});
  } else {
    await message.reply(
      `✅ Verified — welcome **${student.name}**! But the roles I should give (${ROLES_TO_ADD.join(', ')}) are not usable here. Please tell an admin.`
    ).catch(() => {});
  }
});

client.on('error', (err) => console.error('[client error]', err.message));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

client.login(process.env.TOKEN);
