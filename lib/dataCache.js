// lib/dataCache.js - In-Memory Data Cache Layer
// Reduces Google Sheets API calls by caching data in memory

const cache = {
  clients: {
    data: null,
    lastFetch: 0,
    ttl: 300000, // 5 minutes
    loading: false
  },
  jobs: {
    data: null,
    lastFetch: 0,
    ttl: 300000, // 5 minutes  
    loading: false
  },
  invoices: {
    data: null,
    lastFetch: 0,
    ttl: 600000, // 10 minutes (less frequent changes)
    loading: false
  },
  tasks: {
    data: null,
    lastFetch: 0,
    ttl: 300000, // 5 minutes
    loading: false
  }
};

// Import original functions (will be set after module loads to avoid circular dependency)
let originalGetClients, originalGetJobs, originalGetInvoices, originalGetTasks;

function setOriginalFunctions(funcs) {
  originalGetClients = funcs.getClients;
  originalGetJobs = funcs.getJobs;
  originalGetInvoices = funcs.getInvoices;
  originalGetTasks = funcs.getTasks;
}

// Generic cache function
async function getCachedData(cacheKey, originalFunction, entityName) {
  const now = Date.now();
  const cacheEntry = cache[cacheKey];
  
  // Check if we have valid cached data
  if (cacheEntry.data && (now - cacheEntry.lastFetch) < cacheEntry.ttl) {
    console.log(`🎯 Cache HIT for ${entityName} (age: ${Math.round((now - cacheEntry.lastFetch) / 1000)}s)`);
    return cacheEntry.data;
  }
  
  // Prevent multiple simultaneous requests
  if (cacheEntry.loading) {
    console.log(`⏳ Cache loading in progress for ${entityName}, waiting...`);
    // Wait for the other request to complete
    while (cacheEntry.loading) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return cacheEntry.data;
  }
  
  try {
    cacheEntry.loading = true;
    console.log(`📡 Cache MISS for ${entityName} - fetching from Sheets API`);
    
    const data = await originalFunction();
    
    cacheEntry.data = data;
    cacheEntry.lastFetch = now;
    
    console.log(`✅ Cached ${data.length} ${entityName} (TTL: ${cacheEntry.ttl / 1000}s)`);
    return data;
    
  } catch (error) {
    console.error(`❌ Cache fetch failed for ${entityName}:`, error);
    // Return stale data if available, otherwise re-throw
    if (cacheEntry.data) {
      console.warn(`⚠️ Returning stale ${entityName} data due to fetch error`);
      return cacheEntry.data;
    }
    throw error;
  } finally {
    cacheEntry.loading = false;
  }
}

// Cached data getters
async function getCachedClients() {
  if (!originalGetClients) throw new Error('Original getClients function not set');
  return getCachedData('clients', originalGetClients, 'clients');
}

async function getCachedJobs() {
  if (!originalGetJobs) throw new Error('Original getJobs function not set');
  return getCachedData('jobs', originalGetJobs, 'jobs');
}

async function getCachedInvoices() {
  if (!originalGetInvoices) throw new Error('Original getInvoices function not set');
  return getCachedData('invoices', originalGetInvoices, 'invoices');
}

async function getCachedTasks() {
  if (!originalGetTasks) throw new Error('Original getTasks function not set');
  return getCachedData('tasks', originalGetTasks, 'tasks');
}

// Cache invalidation functions
function invalidateCache(cacheKey) {
  if (cache[cacheKey]) {
    console.log(`🗑️ Invalidating ${cacheKey} cache`);
    cache[cacheKey].data = null;
    cache[cacheKey].lastFetch = 0;
  }
}

function invalidateAllCache() {
  console.log('🗑️ Invalidating all caches');
  Object.keys(cache).forEach(key => {
    cache[key].data = null;
    cache[key].lastFetch = 0;
  });
}

// Force refresh specific cache
async function refreshCache(cacheKey) {
  invalidateCache(cacheKey);
  switch (cacheKey) {
    case 'clients': return getCachedClients();
    case 'jobs': return getCachedJobs();
    case 'invoices': return getCachedInvoices();
    case 'tasks': return getCachedTasks();
    default: throw new Error(`Unknown cache key: ${cacheKey}`);
  }
}

// Get cache stats for debugging
function getCacheStats() {
  const stats = {};
  Object.keys(cache).forEach(key => {
    const entry = cache[key];
    const age = entry.lastFetch ? Date.now() - entry.lastFetch : null;
    stats[key] = {
      hasData: !!entry.data,
      count: entry.data ? entry.data.length : 0,
      ageSeconds: age ? Math.round(age / 1000) : null,
      ttlSeconds: entry.ttl / 1000,
      isExpired: age ? age > entry.ttl : true,
      isLoading: entry.loading
    };
  });
  return stats;
}

module.exports = {
  // Setup
  setOriginalFunctions,
  
  // Cached getters
  getCachedClients,
  getCachedJobs,
  getCachedInvoices,
  getCachedTasks,
  
  // Cache management
  invalidateCache,
  invalidateAllCache,
  refreshCache,
  getCacheStats
};
