const NodeCache = require("node-cache");
const { fetchWithProxy } = require("./fetch");
const logger = require("../logger");
const stats = require("./stats");

const myCache = new NodeCache();

// const CONFIG_BACKEND_URL = "http://localhost:5000";
const CONFIG_BACKEND_URL =
  process.env.CONFIG_BACKEND_URL || "https://api.rudderlabs.com";
const getTransformationURL = `${CONFIG_BACKEND_URL}/transformation/getByVersionId`;

// Gets the transformation from config backend.
// Stores the transformation object in memory with time to live after which it expires.
// VersionId is updated any time user changes the code in transformation, so there wont be any stale code issues.
async function getTransformationCode(versionId) {
  const transformation = myCache.get(versionId);
  if (transformation) return transformation;
  try {
    const startTime = new Date();
    logger.info(`Fetching transformation code for ${versionId} from ${getTransformationURL}?versionId=${versionId}`);
    const response = await fetchWithProxy(
      `${getTransformationURL}?versionId=${versionId}`
    );
    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `Transformation not found at ${getTransformationURL}?versionId=${versionId}. Received HTTP Error Response: ${response.status} ${response.statusText}`
      );
    }
    stats.increment("get_transformation_code.success");
    stats.timing("get_transformation_code", startTime, { versionId });
    const myJson = await response.json();
    myCache.set(versionId, myJson);
    return myJson;
  } catch (error) {
    logger.error(error);
    stats.increment("get_transformation_code.error", 1, { versionId });
    throw error;
  }
}

exports.getTransformationCode = getTransformationCode;
exports.CONFIG_BACKEND_URL = CONFIG_BACKEND_URL;
