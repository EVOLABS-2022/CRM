// lib/jobCreateFinalize.js
const { findClientById, createJob } = require('./store');
const { updateBoardMessage } = require('./board');
const { postOrUpdateClientPanel } = require('./clientPanel');
const { ensureJobThread } = require('./jobThreads');
const { jobEmbed } = require('./ui');

async function finalizeJobCreate(interaction, data, tags) {
  const {
    title, clientId, clientName, description, status, priority, budget, assigneeId, deadline
  } = data;

  const job = createJob({
    title,
    clientId,
    assigneeId,
    deadline,
    tags,
    description,
    status,
    priority,
    budget,
  });

  await interaction.update({
    content: '✅ Job created.',
    components: []
  });

  const assigneeMention = assigneeId ? `<@${assigneeId}>` : '—';
  await interaction.followUp({
    embeds: [jobEmbed(job, { clientName, assigneeMention })],
    ephemeral: true
  });

  try {
    await updateBoardMessage(interaction.client);
    const clientRec = findClientById(clientId);
    if (clientRec?.channelId) {
      await ensureJobThread(interaction.client, clientRec.channelId, job);
    }
    await postOrUpdateClientPanel(interaction.client, clientId);
  } catch {}

  return;
}

module.exports = { finalizeJobCreate };