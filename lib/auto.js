// lib/auto.js
const { listClients, listJobs } = require('./store');

/* ----- helpers ----- */
function uniq(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = String(x).toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(x); }
  }
  return out;
}
function toChoices(items, limit = 25) {
  return items.slice(0, limit).map(x => {
    if (typeof x === 'string') return { name: x, value: x };
    return x; // already a {name,value}
  });
}
function suggestClients(query, opts = {}) {
  const { includeArchived = false } = opts;
  const q = (query || '').trim().toLowerCase();
  const all = listClients().filter(c => includeArchived ? true : !c.archived);
  const scored = all.map(c => {
    const code = (c.code || '').toLowerCase();
    const name = (c.name || '').toLowerCase();
    const id = (c.id || '').toLowerCase();
    let score = 0;
    if (!q) score = 1;
    else {
      if (code.startsWith(q)) score += 3;
      if (name.startsWith(q)) score += 2;
      if (id.startsWith(q)) score += 1;
      if (code.includes(q)) score += 1;
      if (name.includes(q)) score += 1;
    }
    return { c, score };
  }).filter(x => x.score > 0);
  scored.sort((a,b) => b.score - a.score);
  return toChoices(scored.slice(0, 25).map(({c}) => ({
    name: `${c.code || c.id} — ${c.name}`,
    value: c.id
  })));
}
function suggestJobs(query) {
  const q = (query || '').trim().toLowerCase();
  const all = listJobs();
  const scored = all.map(j => {
    const code = (j.code || '').toLowerCase();
    const title = (j.title || '').toLowerCase();
    const id = (j.id || '').toLowerCase();
    let score = 0;
    if (!q) score = 1;
    else {
      if (code.startsWith(q)) score += 3;
      if (title.startsWith(q)) score += 2;
      if (id.startsWith(q)) score += 1;
      if (code.includes(q)) score += 1;
      if (title.includes(q)) score += 1;
    }
    return { j, score };
  }).filter(x => x.score > 0);
  scored.sort((a,b) => b.score - a.score);
  return toChoices(scored.slice(0, 25).map(({j}) => ({
    name: `${j.code || j.id} — ${j.title}`,
    value: j.id
  })));
}
function titleCaseTag(t) {
  if (!t) return '';
  if (t.toLowerCase() === 'web3') return 'web3';
  return t.split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w).join(' ');
}
function suggestTags(query) {
  const q = (query || '').trim().toLowerCase();
  const used = [];
  for (const j of listJobs()) {
    if (Array.isArray(j.tags)) {
      for (const t of j.tags) {
        if (!t) continue;
        used.push(String(t).trim());
      }
    }
  }
  let pool = uniq(used);
  if (!pool.length) {
    pool = ['web design','bot','art','animation','web3','maintenance','other'];
  }
  const filtered = pool
    .filter(t => !q || t.toLowerCase().includes(q))
    .sort((a,b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const choices = filtered.map(t => ({ name: titleCaseTag(t), value: t }));
  return toChoices(choices, 25);
}

/* ----- router ----- */
async function routeAutocomplete(interaction) {
  const focused = interaction.options.getFocused(true);
  const focusedName = focused?.name;
  const focusedValue = focused?.value ?? '';
  const cmd = interaction.commandName;
  const sub = interaction.options.getSubcommand(false);
  const group = interaction.options.getSubcommandGroup(false);

  // /job ...
  if (cmd === 'job') {
    if (sub === 'create') {
      if (focusedName === 'client') return interaction.respond(suggestClients(focusedValue));
      if (focusedName === 'tags')   return interaction.respond(suggestTags(focusedValue));
    }

    if (sub === 'edit') {
      if (focusedName === 'id')     return interaction.respond(suggestJobs(focusedValue));
      if (focusedName === 'client') return interaction.respond(suggestClients(focusedValue));
      if (focusedName === 'tags')   return interaction.respond(suggestTags(focusedValue));
    }

    if (sub === 'status' || sub === 'close') {
      if (focusedName === 'id')     return interaction.respond(suggestJobs(focusedValue));
    }

    if (sub === 'delete') {
      if (focusedName === 'id')     return interaction.respond(suggestJobs(focusedValue)); // ✅ new
    }

    if (sub === 'list') {
      if (focusedName === 'client') return interaction.respond(suggestClients(focusedValue));
      if (focusedName === 'tag')    return interaction.respond(suggestTags(focusedValue));
    }
  }

  // /client ...
  if (cmd === 'client') {
    if (group === 'panel' && sub === 'set') {
      if (focusedName === 'id')     return interaction.respond(suggestClients(focusedValue));
    }
    if (sub === 'edit') {
      if (focusedName === 'id')     return interaction.respond(suggestClients(focusedValue));
    }
    if (sub === 'merge') {
      if (focusedName === 'id1' || focusedName === 'id2') {
        return interaction.respond(suggestClients(focusedValue));
      }
    }
    if (sub === 'delete') {
      if (focusedName === 'id')     return interaction.respond(suggestClients(focusedValue, { includeArchived: true })); // ✅ include archived
    }
  }

  return interaction.respond([]);
}

module.exports = { routeAutocomplete };