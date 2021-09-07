/* eslint-disable no-useless-constructor */
const { default: axios } = require("axios");
const { CONFIG_BACKEND_URL } = require("../util/customTransforrmationsStore");
const BaseCache = require("./base");

class AccountCache extends BaseCache {
  constructor() {
    super();
  }

  static getTokenUrl(key) {
    const [accountId, workspaceId] = key.split("|");
    return `${CONFIG_BACKEND_URL}/dest/workspaces/${workspaceId}/accounts/${accountId}/token`;
  }

  async getToken(key) {
    const tokenUrl = this.constructor.getTokenUrl(key);
    const { data: token } = await axios.post(tokenUrl);
    return token;
  }

  async onExpired(k, v) {
    // Only AccessToken is being fetched in this call
    const token = await this.getToken(k);
    this.set(k, token);
  }

  async getTokenFromCache(workspaceId, accountId) {
    const key = `${accountId}|${workspaceId}`;
    if (!this.get(key)) {
      await this.onExpired(key, "");
    }
    return this.get(key);
  }
}

module.exports = AccountCache;