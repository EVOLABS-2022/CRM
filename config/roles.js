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
  // Full access to everything including financials
  FULL: 'full',
  
  // Can see all data except financials
  DATA_ONLY: 'data_only',
  
  // Only own tasks
  OWN_TASKS: 'own_tasks'
};

// Map roles to permissions
const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: PERMISSIONS.FULL,
  [ROLES.TEAM_LEAD]: PERMISSIONS.DATA_ONLY,
  [ROLES.STAFF]: PERMISSIONS.OWN_TASKS
};

// Helper function to check user permissions
function getUserPermission(member) {
  // Check roles in order of highest to lowest permission
  if (member.roles.cache.has(ROLES.ADMIN)) return PERMISSIONS.FULL;
  if (member.roles.cache.has(ROLES.TEAM_LEAD)) return PERMISSIONS.DATA_ONLY;
  if (member.roles.cache.has(ROLES.STAFF)) return PERMISSIONS.OWN_TASKS;
  
  return null; // No access
}

// Helper function to check specific permission
function hasPermission(member, requiredPermission) {
  const userPermission = getUserPermission(member);
  if (!userPermission) return false;
  
  // Permission hierarchy
  const hierarchy = {
    [PERMISSIONS.FULL]: 3,
    [PERMISSIONS.DATA_ONLY]: 2,
    [PERMISSIONS.OWN_TASKS]: 1
  };
  
  const requiredLevel = hierarchy[requiredPermission] || 0;
  const userLevel = hierarchy[userPermission] || 0;
  
  return userLevel >= requiredLevel;
}

// Check if user can see financial data
function canSeeCosts(member) {
  return getUserPermission(member) === PERMISSIONS.FULL;
}

module.exports = {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  getUserPermission,
  hasPermission,
  canSeeCosts
};
