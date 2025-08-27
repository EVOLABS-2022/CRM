// config/roles.js
// Define your Discord role IDs here
const ROLES = {
  // Full access - can see everything including costs/invoices
  ADMIN: '1408987391162585138', // Office role
  
  // Can see all CRM data but no financial info (invoices/costs)
  TEAM_LEAD: '1410382808828088371', // Team Lead role
  
  // Can only see their own assigned tasks
  STAFF: '1349398883679211604' // Staff role
};

// Permission levels
const PERMISSIONS = {
  // Full access to everything including financials (Office role)
  OFFICE: 'office',
  
  // Can see client names, descriptions, job details - NO financials (Team Lead)
  TEAM_LEAD: 'team_lead',
  
  // Can only access tasks channel with filtered task views (Staff)  
  TASKS_ONLY: 'tasks_only'
};

// Map roles to permissions
const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: PERMISSIONS.OFFICE,
  [ROLES.TEAM_LEAD]: PERMISSIONS.TEAM_LEAD,
  [ROLES.STAFF]: PERMISSIONS.TASKS_ONLY
};

// Helper function to check user permissions
function getUserPermission(member) {
  // Check roles in order of highest to lowest permission
  if (member.roles.cache.has(ROLES.ADMIN)) return PERMISSIONS.OFFICE;
  if (member.roles.cache.has(ROLES.TEAM_LEAD)) return PERMISSIONS.TEAM_LEAD;
  if (member.roles.cache.has(ROLES.STAFF)) return PERMISSIONS.TASKS_ONLY;
  
  return null; // No access
}

// Helper function to check specific permission
function hasPermission(member, requiredPermission) {
  const userPermission = getUserPermission(member);
  if (!userPermission) return false;
  
  // Permission hierarchy
  const hierarchy = {
    [PERMISSIONS.OFFICE]: 3,
    [PERMISSIONS.TEAM_LEAD]: 2,
    [PERMISSIONS.TASKS_ONLY]: 1
  };
  
  const requiredLevel = hierarchy[requiredPermission] || 0;
  const userLevel = hierarchy[userPermission] || 0;
  
  return userLevel >= requiredLevel;
}

// Check if user can see financial data
function canSeeCosts(member) {
  return getUserPermission(member) === PERMISSIONS.OFFICE;
}

// Check if user can see client/job management data
function canSeeClientJobData(member) {
  const permission = getUserPermission(member);
  return permission === PERMISSIONS.OFFICE || permission === PERMISSIONS.TEAM_LEAD;
}

// Check if user should only see tasks
function isTasksOnlyUser(member) {
  return getUserPermission(member) === PERMISSIONS.TASKS_ONLY;
}

module.exports = {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  getUserPermission,
  hasPermission,
  canSeeCosts,
  canSeeClientJobData,
  isTasksOnlyUser
};
