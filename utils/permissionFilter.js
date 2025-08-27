// utils/permissionFilter.js
const { canSeeCosts, canSeeClientJobData, isTasksOnlyUser, hasPermission, PERMISSIONS } = require('../config/roles');

/**
 * Filter client data based on user permissions
 */
function filterClientData(client, member) {
  const filtered = { ...client };
  
  // Staff users shouldn't see client data at all (tasks channel only)
  if (isTasksOnlyUser(member)) {
    return {
      id: filtered.id,
      name: filtered.name,
      code: filtered.code
      // Just basic info for task context
    };
  }
  
  // Team Lead can see client name, description, contact info - NO auth codes
  if (hasPermission(member, PERMISSIONS.TEAM_LEAD) && !canSeeCosts(member)) {
    delete filtered.authCode; // Hide auth codes from Team Lead
    return filtered;
  }
  
  // Office role can see everything
  if (canSeeCosts(member)) {
    return filtered;
  }
  
  return null; // No access
}

/**
 * Filter job data based on user permissions
 */
function filterJobData(job, member, userDiscordId = null) {
  const filtered = { ...job };
  
  // Staff users shouldn't see job data directly (tasks channel only)
  if (isTasksOnlyUser(member)) {
    return {
      id: filtered.id,
      title: filtered.title,
      clientId: filtered.clientId
      // Just basic info for task context, NO budget/prices
    };
  }
  
  // Team Lead can see job details but NO budget/financial info
  if (hasPermission(member, PERMISSIONS.TEAM_LEAD) && !canSeeCosts(member)) {
    delete filtered.budget;
    delete filtered.hourlyRate;
    delete filtered.estimatedHours;
    // Keep title, description, status, deadline, etc.
    return filtered;
  }
  
  // Office role can see everything including budget
  if (canSeeCosts(member)) {
    return filtered;
  }
  
  return null; // No access
}

/**
 * Filter invoice data based on user permissions
 */
function filterInvoiceData(invoice, member) {
  // Only users with financial access can see invoices
  if (!canSeeCosts(member)) {
    return null;
  }
  
  return { ...invoice };
}

/**
 * Filter task data based on user permissions
 */
function filterTaskData(task, member, userDiscordId = null) {
  const filtered = { ...task };
  
  // Office role can see all tasks
  if (canSeeCosts(member)) {
    return filtered;
  }
  
  // Team Lead can see all tasks
  if (hasPermission(member, PERMISSIONS.TEAM_LEAD)) {
    return filtered;
  }
  
  // Staff can only see their own tasks
  if (isTasksOnlyUser(member)) {
    if (task.assigneeId !== userDiscordId) {
      return null; // Hide tasks not assigned to them
    }
    return filtered;
  }
  
  return null; // No access
}

/**
 * Create a permission-aware client embed
 */
function createClientEmbed(client, jobs, member, guildId) {
  const filteredClient = filterClientData(client, member);
  if (!filteredClient) return null;
  
  const { buildClientCardEmbed } = require('../lib/clientCard');
  
  // Filter jobs based on permissions
  const filteredJobs = jobs
    .map(job => filterJobData(job, member, member.user.id))
    .filter(Boolean);
  
  return buildClientCardEmbed(filteredClient, filteredJobs, guildId);
}

/**
 * Add permission info to embed footer
 */
function addPermissionFooter(embed, member) {
  const { getUserPermission } = require('../config/roles');
  const permission = getUserPermission(member);
  
  const permissionText = {
    'office': '🔓 Full Access (Office)',
    'team_lead': '📊 Data Access (Team Lead)',  
    'tasks_only': '📝 Task Access (Staff)'
  }[permission] || '❌ No Access';
  
  const currentFooter = embed.data.footer?.text || '';
  const newFooter = currentFooter ? `${currentFooter} • ${permissionText}` : permissionText;
  
  return embed.setFooter({ text: newFooter });
}

module.exports = {
  filterClientData,
  filterJobData,
  filterInvoiceData,
  filterTaskData,
  createClientEmbed,
  addPermissionFooter
};
