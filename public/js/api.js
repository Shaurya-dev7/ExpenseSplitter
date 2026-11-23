// Centralized API client with automatic Bearer token injection and global 401 interceptor

let unauthorizedHandler = null;

export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

const TOKEN_KEY = 'fs_auth_token';
const USER_KEY = 'fs_auth_user';

export function getStoredToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

export async function apiRequest(endpoint, method = 'GET', body = undefined) {
  if (!navigator.onLine) {
    throw new Error('You are offline. Connect to the internet to perform this action.');
  }

  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json'
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const options = {
    method,
    headers
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(endpoint, options);
  } catch (err) {
    throw new Error('Unable to reach server. Please check your connection.');
  }

  // Global 401 Interceptor
  if (res.status === 401) {
    try {
      sessionStorage.removeItem('fairshare_token');
      sessionStorage.removeItem('fairshare_user');
      localStorage.removeItem('fairshare_token');
      localStorage.removeItem('fairshare_user');
    } catch {}

    if (typeof unauthorizedHandler === 'function') {
      unauthorizedHandler('Your session expired. Please sign in again.');
    }

    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }

  if (res.status === 204) {
    return null;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('Invalid response received from server.');
  }

  if (!res.ok) {
    let msg = data.error;
    if (data.errors && typeof data.errors === 'object') {
      msg = Object.values(data.errors).join(' ');
    }
    const error = new Error(msg || 'An error occurred.');
    error.status = res.status;
    error.errors = data.errors;
    throw error;
  }

  return data;
}

// Dedicated endpoint wrappers
export async function fetchDashboard() {
  return apiRequest('/api/dashboard', 'GET');
}

export async function fetchGroup(id) {
  const [group, expenses, balRes, setRes] = await Promise.all([
    apiRequest(`/api/groups/${encodeURIComponent(id)}`, 'GET'),
    apiRequest(`/api/groups/${encodeURIComponent(id)}/expenses`, 'GET').catch(() => []),
    apiRequest(`/api/groups/${encodeURIComponent(id)}/balances`, 'GET').catch(() => ({ balances: [] })),
    apiRequest(`/api/groups/${encodeURIComponent(id)}/settlements`, 'GET').catch(() => ({ transfers: [] }))
  ]);

  return {
    ...group,
    isActive: group.isActive !== false,
    expenses: Array.isArray(expenses) ? expenses : [],
    balances: Array.isArray(balRes?.balances) ? balRes.balances : [],
    settlements: Array.isArray(setRes?.transfers) ? setRes.transfers : []
  };
}

export async function setGroupStatus(groupId, isActive) {
  return apiRequest(`/api/groups/${encodeURIComponent(groupId)}/status`, 'PATCH', { isActive });
}

export async function createGroup(group) {
  return apiRequest('/api/groups', 'POST', group);
}

export async function addExpense(groupId, expense) {
  return apiRequest(`/api/groups/${encodeURIComponent(groupId)}/expenses`, 'POST', expense);
}

export async function deleteExpense(groupId, expenseId) {
  return apiRequest(`/api/groups/${encodeURIComponent(groupId)}/expenses/${encodeURIComponent(expenseId)}`, 'DELETE');
}

export async function addMember(groupId, name) {
  return apiRequest(`/api/groups/${encodeURIComponent(groupId)}/members`, 'POST', { name });
}

export async function getBalances(groupId) {
  return apiRequest(`/api/groups/${encodeURIComponent(groupId)}/balances`, 'GET');
}

export async function getSettlements(groupId) {
  return apiRequest(`/api/groups/${encodeURIComponent(groupId)}/settlements`, 'GET');
}

export async function recordPayment(groupId, payment) {
  return apiRequest(`/api/groups/${encodeURIComponent(groupId)}/payments`, 'POST', payment);
}
