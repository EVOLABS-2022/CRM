// lib/jobCreateFinalize.js - TEMPORARILY DISABLED
// This function needs to be updated for Google Sheets architecture
// const { getClients, createJob } = require('./sheetsDb');
// const { refreshAllBoards } = require('./board');
// const { refreshAllClientPanels } = require('./clientPanel');
// const { ensureJobThread } = require('./jobThreads');

async function finalizeJobCreate(interaction, data, tags) {
  throw new Error('Job creation finalize temporarily disabled - use /job create command instead');
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