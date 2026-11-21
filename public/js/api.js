/**
 * REST API Client for Group Expense Splitter.
 * Communicates with /api/groups endpoints.
 */

class ApiError extends Error {
  constructor(message, status, errors = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

async function request(path, options = {}) {
  const url = path.startsWith("/api") ? path : `/api${path}`;
  const headers = {
    "Accept": "application/json",
    ...(options.headers || {}),
  };

  if (options.body && typeof options.body === "object") {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  try {
    const res = await fetch(url, { ...options, headers });

    // Handle 204 No Content
    if (res.status === 204) {
      return null;
    }

    let data;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const errorMessage =
        (data && data.error) ||
        (data && data.message) ||
        `Request failed with status ${res.status}`;
      const fieldErrors = (data && data.errors) || null;
      throw new ApiError(errorMessage, res.status, fieldErrors);
    }

    return data;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(err.message || "Network error. Please check your connection.", 0);
  }
}

window.API = {
  /**
   * Create a new group.
   * @param {object} param0
   * @param {string} param0.name
   * @param {string[]} param0.members
   * @returns {Promise<{id: string, name: string, members: Array<{id: number, name: string}>}>}
   */
  async createGroup({ name, members }) {
    return request("/groups", {
      method: "POST",
      body: { name, members },
    });
  },

  /**
   * Get group details and member list.
   * @param {string} gid
   * @returns {Promise<{id: string, name: string, members: Array<{id: number, name: string}>}>}
   */
  async getGroup(gid) {
    return request(`/groups/${encodeURIComponent(gid)}`, {
      method: "GET",
    });
  },

  /**
   * Add a member to an existing group.
   * @param {string} gid
   * @param {string} name
   * @returns {Promise<{id: number, name: string}>}
   */
  async addMember(gid, name) {
    return request(`/groups/${encodeURIComponent(gid)}/members`, {
      method: "POST",
      body: { name },
    });
  },

  /**
   * Add an expense to a group.
   * @param {string} gid
   * @param {object} expenseData
   * @returns {Promise<{id: number, description: string, amount: number, paidBy: number, splits: object, createdAt: string}>}
   */
  async addExpense(gid, expenseData) {
    return request(`/groups/${encodeURIComponent(gid)}/expenses`, {
      method: "POST",
      body: expenseData,
    });
  },

  /**
   * List all expenses for a group (oldest first).
   * @param {string} gid
   * @returns {Promise<Array<{id: number, description: string, amount: number, paidBy: number, splits: object, createdAt: string}>>}
   */
  async listExpenses(gid) {
    return request(`/groups/${encodeURIComponent(gid)}/expenses`, {
      method: "GET",
    });
  },

  /**
   * Delete an expense.
   * @param {string} gid
   * @param {number} eid
   * @returns {Promise<void>}
   */
  async deleteExpense(gid, eid) {
    return request(`/groups/${encodeURIComponent(gid)}/expenses/${encodeURIComponent(eid)}`, {
      method: "DELETE",
    });
  },

  /**
   * Record a settlement payment.
   * @param {string} gid
   * @param {object} paymentData
   * @param {number} paymentData.from
   * @param {number} paymentData.to
   * @param {number} paymentData.amount
   * @returns {Promise<{id: number, from: number, to: number, amount: number, createdAt: string}>}
   */
  async recordPayment(gid, paymentData) {
    return request(`/groups/${encodeURIComponent(gid)}/payments`, {
      method: "POST",
      body: paymentData,
    });
  },

  /**
   * Get member balances.
   * @param {string} gid
   * @returns {Promise<{balances: Array<{memberId: number, name: string, balance: number}>}>}
   */
  async getBalances(gid) {
    return request(`/groups/${encodeURIComponent(gid)}/balances`, {
      method: "GET",
    });
  },

  /**
   * Get suggested settlements (greedy debt simplification transfers).
   * @param {string} gid
   * @returns {Promise<{transfers: Array<{from: number, to: number, amount: number}>}>}
   */
  async getSettlements(gid) {
    return request(`/groups/${encodeURIComponent(gid)}/settlements`, {
      method: "GET",
    });
  },
};
