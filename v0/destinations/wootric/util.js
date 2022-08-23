const qs = require("qs");
const { httpGET, httpPOST } = require("../../../adapters/network");
const {
  processAxiosResponse
} = require("../../../adapters/utils/networkUtils");
const {
  BASE_ENDPOINT,
  VERSION,
  ACCESS_TOKEN_CACHE_TTL_SECONDS
} = require("./config");
const {
  CustomError,
  constructPayload,
  isDefinedAndNotNullAndNotEmpty
} = require("../../util");
const { CONFIG_CATEGORIES, MAPPING_CONFIG } = require("./config");
const Cache = require("../../util/cache");

const ACCESS_TOKEN_CACHE = new Cache(ACCESS_TOKEN_CACHE_TTL_SECONDS);

/**
 * Returns access token using axios call with parameters (username, password, accountToken taken from destination.Config)
 * ref: https://docs.wootric.com/api/#authentication
 * @param {*} destination
 * @returns
 */
const getAccessToken = async destination => {
  const { username, password, accountToken } = destination.Config;
  const accessTokenKey = destination.ID;

  /**
   * The access token expires around every 2 hour. Cache is used here to check if the access token is present in the cache
   * it is taken from cache using {destination Id} else a post call is made to get the access token.
   * ref: https://docs.wootric.com/api/#authentication
   */
  return ACCESS_TOKEN_CACHE.get(accessTokenKey, async () => {
    const request = {
      header: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      url: `${BASE_ENDPOINT}/oauth/token?account_token=${accountToken}`,
      data: qs.stringify({
        grant_type: "password",
        username,
        password
      }),
      method: "POST"
    };
    const wootricAuthResponse = await httpPOST(
      request.url,
      request.data,
      request.header
    );
    const processedAuthResponse = processAxiosResponse(wootricAuthResponse);
    // If the request fails, throwing error.
    if (processedAuthResponse.status !== 200) {
      throw new CustomError(
        `[Wootric]:: access token could not be generated due to ${JSON.stringify(
          processedAuthResponse.response
        )}`,
        processedAuthResponse.status
      );
    }
    return processedAuthResponse.response?.access_token;
  });
};

/**
 * Returns wootric user details of existing user using Wootric endUserId/externalId
 * ref: https://docs.wootric.com/api/#get-a-specific-end-user-by-id
 * ref: https://docs.wootric.com/api/#get-a-specific-end-user-by-external-id
 * @param {*} endUserId
 * @param {*} externalId //userId
 * @param {*} accessToken
 * @returns
 */
const retrieveUserDetails = async (endUserId, externalId, accessToken) => {
  let endpoint;
  if (isDefinedAndNotNullAndNotEmpty(endUserId)) {
    endpoint = `${BASE_ENDPOINT}/${VERSION}/end_users/${endUserId}`;
  } else if (isDefinedAndNotNullAndNotEmpty(externalId)) {
    endpoint = `${BASE_ENDPOINT}/${VERSION}/end_users/${externalId}?lookup_by_external_id=true`;
  } else {
    throw new CustomError(
      "wootricEndUserId/userId are missing. At least one parameter must be provided",
      400
    );
  }

  const requestOptions = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    }
  };

  const userResponse = await httpGET(endpoint, requestOptions);
  const processedUserResponse = processAxiosResponse(userResponse);

  if (processedUserResponse.status === 200) {
    return processedUserResponse.response;
  }

  if (processedUserResponse.status !== 404) {
    throw new CustomError(
      `[Wootric]:: Unable to retrieve userId due to ${JSON.stringify(
        processedUserResponse.response
      )}`,
      processedUserResponse.status
    );
  }
};

/**
 * Returns 'Create User' payload
 * @param {*} message
 * @returns
 */
const createUserPayloadBuilder = message => {
  const payload = constructPayload(
    message,
    MAPPING_CONFIG[CONFIG_CATEGORIES.CREATE_USER.name]
  );
  const endpoint = CONFIG_CATEGORIES.CREATE_USER.endpoint;
  const method = "POST";
  validateCreateUserPayload(
    payload.external_id,
    payload.email,
    payload.phone_number
  );
  return { payload, endpoint, method };
};

/**
 * Returns 'Update User' payload
 * @param {*} message
 * @returns
 */
const updateUserPayloadBuilder = (message, userDetails) => {
  const payload = constructPayload(
    message,
    MAPPING_CONFIG[CONFIG_CATEGORIES.UPDATE_USER.name]
  );
  payload.properties = buildPayloadProperties(payload, userDetails);
  const endpoint = CONFIG_CATEGORIES.UPDATE_USER.endpoint;
  const method = "PUT";
  delete payload.external_id;
  return { payload, endpoint, method };
};

/**
 * Returns 'Creates Response' payload
 * @param {*} message
 * @returns
 */
const createResponsePayloadBuilder = (message, userDetails) => {
  const payload = constructPayload(
    message,
    MAPPING_CONFIG[CONFIG_CATEGORIES.CREATE_RESPONSE.name]
  );
  payload.properties = buildPayloadProperties(payload, userDetails);
  const endpoint = CONFIG_CATEGORIES.CREATE_RESPONSE.endpoint;
  const method = "POST";
  validateScore(payload.score);
  return { payload, endpoint, method };
};

/**
 * Returns 'Creates Decline' payload
 * @param {*} message
 * @returns
 */
const createDeclinePayloadBuilder = (message, userDetails) => {
  const payload = constructPayload(
    message,
    MAPPING_CONFIG[CONFIG_CATEGORIES.CREATE_DECLINE.name]
  );
  payload.properties = buildPayloadProperties(payload, userDetails);
  const endpoint = CONFIG_CATEGORIES.CREATE_DECLINE.endpoint;
  const method = "POST";
  return { payload, endpoint, method };
};

/**
 * Flattens properties field in payload
 * e.g :- properties[name] = Demo User, end_user[properties][revenue_amount] = 5000
 * ref: https://docs.wootric.com/api/#create-end-user
 * ref: https://docs.wootric.com/api/#create-response
 * @param {*} payload
 * @param {*} destKey
 */
const flattenProperties = (payload, destKey) => {
  if (isDefinedAndNotNullAndNotEmpty(payload.properties)) {
    let rawProperties = {};
    Object.entries(payload.properties).forEach(([key, value]) => {
      rawProperties[`${destKey}[${key}]`] = `${value}`;
    });
    return rawProperties;
  }
};

/**
 * Formats identify payload
 * @param {*} payload
 */
const formatIdentifyPayload = payload => {
  if (payload.last_surveyed) {
    payload.last_surveyed = `${payload.last_surveyed}`;
  }
  if (payload.external_created_at) {
    payload.external_created_at = `${payload.external_created_at}`;
  }
};

/**
 * Formats track payload
 * @param {*} payload
 */
const formatTrackPayload = payload => {
  if (payload.created_at) {
    payload.created_at = `${payload.created_at}`;
  }
};

/**
 * Validates Create User Payload
 * @param {*} email
 * @param {*} phone
 */
const validateCreateUserPayload = (userId, email, phone) => {
  if (!isDefinedAndNotNullAndNotEmpty(userId)) {
    throw new CustomError("userId is missing", 400);
  }

  if (
    !isDefinedAndNotNullAndNotEmpty(email) &&
    !isDefinedAndNotNullAndNotEmpty(phone)
  ) {
    throw new CustomError(
      "email/phone number are missing. At least one parameter must be provided",
      400
    );
  }
};

/**
 * Validates score
 * @param {*} score
 */
const validateScore = score => {
  if (!(score >= 0 && score <= 10)) {
    throw new CustomError("Invalid Score", 400);
  }
};

/**
 * Builds Payload properties
 * @param {*} payload
 * @param {*} userDetails
 * @returns
 */
const buildPayloadProperties = (payload, userDetails) => {
  //Appending existing user properties with payload properties
  if (
    isDefinedAndNotNullAndNotEmpty(payload.properties) &&
    isDefinedAndNotNullAndNotEmpty(userDetails.properties)
  ) {
    const payloadProperties = {
      ...userDetails.properties,
      ...payload.properties
    };
    return payloadProperties;
  }
};

module.exports = {
  getAccessToken,
  retrieveUserDetails,
  flattenProperties,
  formatIdentifyPayload,
  formatTrackPayload,
  createUserPayloadBuilder,
  updateUserPayloadBuilder,
  createResponsePayloadBuilder,
  createDeclinePayloadBuilder
};
