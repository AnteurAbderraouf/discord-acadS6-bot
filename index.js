// index.js — student verification bot.
//
// #matricule works as a queue: a student posts their matricule, and if it is
// in the roster (listeoptions.xlsx, read-only) the bot grants "spe" + "Student",
// DMs a confirmation, then deletes the message. Matricules that are not in the
// roster are left in place, untouched, still waiting.
//
// On startup the bot also works through the messages already sitting in the
// channel, so a backlog posted while it was offline gets processed.
//
// Run with --dry-run to see what would happen without changing anything.
require('dotenv').config({ quiet: true });

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const { findStudent, rosterSize } = require('./excel');

const DRY_RUN = process.argv.includes('--dry-run');

const LOG_PATH = path.join(__dirname, 'used-ids.json');
const VERIF_CHANNEL = 'matricule';
const ROLES_TO_ADD = ['spe', 'Student'];
const MATRICULE_RE = /^\d{8,15}$/;

// How long a fallback in-channel confirmation stays up when a DM can't be sent.
const FALLBACK_MS = 10000;
// Pause between backlog items so we stay well clear of rate limits.
const BACKLOG_DELAY_MS = 800;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// A guild's name can briefly come back empty; never log "undefined".
const guildName = (g) => g.name || `guild:${g.id}`;

// ---------- verification log (append-only) ----------
let verifLog = [];
try {
  const parsed = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  if (Array.isArray(parsed)) verifLog = parsed;
} catch (err) {
  verifLog = [];
}

function appendLog(entry) {
  if (DRY_RUN) return;
  // A still-pending matricule is re-seen on every restart; record it once only.
  if (entry.result === 'pending' && entry.messageId &&
      verifLog.some(e => e.messageId === entry.messageId && e.result === 'pending')) {
    return;
  }
  verifLog.push(entry);
  try {
    fs.writeFileSync(LOG_PATH, JSON.stringify(verifLog, null, 2));
  } catch (err) {
    console.error('[log] Ecriture de used-ids.json impossible:', err.message);
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

// Resolves the roles to grant, reporting any that are missing or outrank us.
async function resolveRoles(guild) {
  const roles = await guild.roles.fetch();
  const me = await guild.members.fetchMe();
  const grant = [], missing = [], tooHigh = [];

  for (const name of ROLES_TO_ADD) {
    const role = roles.find(r => r.name === name);
    if (!role) missing.push(name);
    else if (role.position >= me.roles.highest.position) tooHigh.push(name);
    else grant.push(role);
  }
  return { grant, missing, tooHigh };
}

// Confirmation by DM; if the student's DMs are closed, a short-lived message in
// the channel instead, so the channel does not accumulate replies.
async function confirm(message, text) {
  if (DRY_RUN) return 'dry-run';
  try {
    await message.author.send(text);
    return 'dm';
  } catch (err) {
    try {
      const tmp = await message.channel.send(`${message.author}, ${text}`);
      setTimeout(() => tmp.delete().catch(() => {}), FALLBACK_MS);
      return 'channel-fallback';
    } catch (err2) {
      return 'failed';
    }
  }
}

// Core verification, shared by the live listener and the startup backlog pass.
// Returns a short status string for logging.
async function handleMatricule(message, { live }) {
  const matricule = message.content.trim();
  const where = `${guildName(message.guild)}/#${message.channel.name}`;
  const student = findStudent(matricule);

  // ----- not in the roster -----
  if (!student) {
    if (!live) {
      // Backlog: leave the message exactly as it is, still waiting, but keep a
      // record of it so pending matricules are traceable.
      console.log(`[${where}] ${matricule} -> pas dans le roster, laisse en attente`);
      appendLog({
        matricule, messageId: message.id,
        userId: message.author.id, username: message.author.tag,
        guildId: message.guild.id, guildName: guildName(message.guild),
        result: 'pending', source: 'backlog',
        postedAt: new Date(message.createdTimestamp).toISOString(),
        timestamp: new Date().toISOString()
      });
      return 'pending';
    }
    console.log(`[${where}] ${matricule} -> INTROUVABLE`);
    appendLog({
      matricule, userId: message.author.id, username: message.author.tag,
      guildId: message.guild.id, guildName: guildName(message.guild),
      result: 'not_found', timestamp: new Date().toISOString()
    });
    if (!DRY_RUN) {
      await message.reply(
        "This ID is not in the student list. Check your matricule and try again - " +
        "if you are sure it is correct, contact an admin."
      ).catch(() => {});
    }
    return 'not_found';
  }

  // ----- in the roster: grant roles -----
  const { grant, missing, tooHigh } = await resolveRoles(message.guild);
  if (missing.length || tooHigh.length) {
    console.error(`[${where}] roles problematiques -> ` +
      [missing.length ? `absents: ${missing.join(', ')}` : null,
       tooHigh.length ? `au-dessus du bot: ${tooHigh.join(', ')}` : null]
      .filter(Boolean).join(' | '));
  }

  let member;
  try {
    member = await message.guild.members.fetch(message.author.id);
  } catch (err) {
    // Author left the server; nothing to grant, so leave the message alone.
    console.log(`[${where}] ${matricule} -> auteur absent du serveur, ignore`);
    return 'author_gone';
  }

  let added = [];
  if (grant.length) {
    if (DRY_RUN) {
      added = grant.map(r => r.name);
    } else {
      try {
        await member.roles.add(grant);
        added = grant.map(r => r.name);
      } catch (err) {
        console.error(`[${where}] ${matricule} -> ajout de role echoue: ${err.message}`);
        appendLog({
          matricule: student.matricule, name: student.name,
          userId: message.author.id, username: message.author.tag,
          guildId: message.guild.id, guildName: guildName(message.guild),
          result: 'role_error', error: err.message, timestamp: new Date().toISOString()
        });
        if (live) {
          await message.reply(
            "You are verified, but I could not give you the role (permissions). Please tell an admin."
          ).catch(() => {});
        }
        return 'role_error'; // keep the message so it can be retried
      }
    }
  }

  const how = await confirm(message,
    added.length
      ? `Verified - welcome **${student.name}**! You now have: ${added.join(', ')} in **${guildName(message.guild)}**.`
      : `Verified - welcome **${student.name}**! But the roles (${ROLES_TO_ADD.join(', ')}) are not usable in **${guildName(message.guild)}**. Please tell an admin.`
  );

  // ----- verified, so take it out of the queue -----
  let deleted = false;
  const me = await message.guild.members.fetchMe();
  if (DRY_RUN) {
    deleted = true;
  } else if (message.channel.permissionsFor(me).has(PermissionsBitField.Flags.ManageMessages)) {
    deleted = await message.delete().then(() => true).catch(err => {
      console.error(`[${where}] suppression impossible: ${err.message}`);
      return false;
    });
  } else {
    console.error(`[${where}] pas la permission ManageMessages, message conserve`);
  }

  console.log(`[${where}] ${matricule} -> OK (${student.name}) roles: ` +
    `${added.join(', ') || 'aucun'} | confirmation: ${how} | supprime: ${deleted}`);

  appendLog({
    matricule: student.matricule, name: student.name,
    userId: message.author.id, username: message.author.tag,
    guildId: message.guild.id, guildName: guildName(message.guild),
    result: 'verified', rolesAdded: added, rolesMissing: missing,
    confirmation: how, messageDeleted: deleted, source: live ? 'live' : 'backlog',
    timestamp: new Date().toISOString()
  });
  return 'verified';
}

// Reads everything already in #matricule and processes it oldest-first.
async function processBacklog(guild) {
  let channel = guild.channels.cache.find(c => c.name === VERIF_CHANNEL && c.type === 0);
  if (!channel) {
    const fetched = await guild.channels.fetch().catch(() => null);
    channel = fetched && fetched.find(c => c && c.name === VERIF_CHANNEL && c.type === 0);
  }
  if (!channel) {
    console.log(`[${guildName(guild)}] pas de #${VERIF_CHANNEL}, ignore`);
    return;
  }

  // Page back through the history, then handle oldest first.
  const collected = [];
  let before;
  for (let page = 0; page < 20; page++) {
    const batch = await channel.messages
      .fetch({ limit: 100, ...(before ? { before } : {}) })
      .catch(() => null);
    if (!batch || batch.size === 0) break;
    collected.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }

  const queue = collected
    .filter(m => !m.author.bot && MATRICULE_RE.test(m.content.trim()))
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  if (queue.length === 0) {
    console.log(`[${guildName(guild)}] backlog: rien a traiter`);
    return;
  }

  console.log(`[${guildName(guild)}] backlog: ${queue.length} matricule(s) en attente`);
  const tally = {};
  for (const message of queue) {
    const status = await handleMatricule(message, { live: false }).catch(err => {
      console.error(`[${guildName(guild)}] erreur backlog: ${err.message}`);
      return 'error';
    });
    tally[status] = (tally[status] || 0) + 1;
    await sleep(BACKLOG_DELAY_MS);
  }
  console.log(`[${guildName(guild)}] backlog termine: ` +
    Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(', '));
}

client.once('clientReady', async () => {
  console.log(`Connecte en tant que ${client.user.tag}` +
    (DRY_RUN ? '  [DRY RUN - rien ne sera modifie]' : ''));
  console.log(`Roster: ${rosterSize()} matricules.`);
  console.log(`Serveurs (${client.guilds.cache.size}): ` +
    [...client.guilds.cache.values()].map(guildName).join(', '));

  for (const [, guild] of client.guilds.cache) {
    await processBacklog(guild).catch(err =>
      console.error(`[${guildName(guild)}] backlog echoue: ${err.message}`));
  }

  console.log(`En ecoute dans #${VERIF_CHANNEL} sur chaque serveur.`);
  if (DRY_RUN) {
    console.log('DRY RUN termine - aucune modification effectuee.');
    client.destroy();
  }
});

client.on('messageCreate', async (message) => {
  if (DRY_RUN) return;
  if (message.author.bot || !message.guild) return;
  if (message.channel.name !== VERIF_CHANNEL) return;

  const content = message.content.trim();
  if (!content) return;

  if (!MATRICULE_RE.test(content)) {
    console.log(`[${guildName(message.guild)}/#${message.channel.name}] ` +
      `Ignore (pas un matricule): "${content.slice(0, 40)}"`);
    return;
  }

  await handleMatricule(message, { live: true }).catch(err =>
    console.error(`[${guildName(message.guild)}] erreur: ${err.message}`));
});

client.on('error', (err) => console.error('[client error]', err.message));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));

client.login(process.env.TOKEN);
