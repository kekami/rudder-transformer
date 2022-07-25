const get = require("get-value");
const _ = require("lodash");
const { MappedToDestinationKey } = require("../../../constants");
const {
  defaultGetRequestConfig,
  defaultPostRequestConfig,
  defaultRequestConfig,
  getFieldValueFromMessage,
  getSuccessRespEvents,
  CustomError,
  addExternalIdToTraits,
  defaultBatchRequestConfig,
  removeUndefinedAndNullValues,
  getDestinationExternalID,
  getDestinationExternalIDInfoForRetl
} = require("../../util");
const {
  BATCH_CONTACT_ENDPOINT,
  MAX_BATCH_SIZE,
  TRACK_ENDPOINT,
  IDENTIFY_CREATE_UPDATE_CONTACT,
  IDENTIFY_CREATE_NEW_CONTACT,
  hsCommonConfigJson,
  CRM_CREATE_CUSTOM_OBJECTS
} = require("./config");
const {
  getTransformedJSON,
  getEmailAndUpdatedProps,
  formatPropertyValueForIdentify
} = require("./util");

/**
 * using legacy API
 * Reference:
 * https://legacydocs.hubspot.com/docs/methods/contacts/create_contact
 * https://legacydocs.hubspot.com/docs/methods/contacts/create_or_update
 *
 * for rETL support for custom objects
 * Ref - https://developers.hubspot.com/docs/api/crm/crm-custom-objects
 * @param {*} message
 * @param {*} destination
 * @param {*} propertyMap
 * @returns
 */
const processLegacyIdentify = async (message, destination, propertyMap) => {
  const { Config } = destination;
  const traits = getFieldValueFromMessage(message, "traits");
  const mappedToDestination = get(message, MappedToDestinationKey);
  // if mappedToDestination is set true, then add externalId to traits
  // rETL source
  if (mappedToDestination) {
    addExternalIdToTraits(message);
  } else if (!traits || !traits.email) {
    throw new CustomError(
      "[HS]:: Identify without email is not supported.",
      400
    );
  }

  const userProperties = await getTransformedJSON(
    message,
    hsCommonConfigJson,
    destination,
    propertyMap
  );

  const payload = {
    properties: formatPropertyValueForIdentify(userProperties)
  };

  // build response
  const { email } = traits;
  let endpoint;
  const response = defaultRequestConfig();

  // for rETL source support for custom objects
  // Ref - https://developers.hubspot.com/docs/api/crm/crm-custom-objects
  if (mappedToDestination) {
    const { objectType } = getDestinationExternalIDInfoForRetl(message, "HS");
    endpoint = CRM_CREATE_CUSTOM_OBJECTS.replace(":objectType", objectType);
    response.body.JSON = removeUndefinedAndNullValues({ properties: traits });
    response.source = "rETL";
  } else {
    if (email) {
      endpoint = IDENTIFY_CREATE_UPDATE_CONTACT.replace(
        ":contact_email",
        email
      );
    } else {
      endpoint = IDENTIFY_CREATE_NEW_CONTACT;
    }
    response.body.JSON = removeUndefinedAndNullValues(payload);
  }

  response.endpoint = endpoint;
  response.method = defaultPostRequestConfig.requestMethod;
  response.headers = {
    "Content-Type": "application/json"
  };

  // choosing API Type
  if (Config.authorizationType === "newPrivateAppApi") {
    // Private Apps
    response.headers = {
      ...response.headers,
      Authorization: `Bearer ${Config.accessToken}`
    };
  } else {
    // use legacy API Key
    response.params = { hapikey: Config.apiKey };
  }

  return response;
};

/**
 * CRM API
 * Associations v3
 * here we are associating objectType to contact only
 * Ref - https://developers.hubspot.com/docs/api/crm/associations/v3
 * @param {*} message
 * @param {*} destination
 * @param {*} propertyMap
 */
// const processCRMCustomObjects = async (message, destination, traits) => {
//   const { Config } = destination;
//   let response = {};

//   const { contactId, qualifiedName, objects } = traits.hubspot;
//   if (!contactId) {
//     throw new Error(
//       "HubSpot contactId is not provided. Aborting custom-object association",
//       400
//     );
//   }

//   if (!qualifiedName) {
//     throw new Error(
//       "HubSpot qualifiedName is not provided. Aborting custom-object association",
//       400
//     );
//   }

//   if (!objects || !Array.isArray(objects) || objects.length === 0) {
//     throw new Error(
//       "HubSpot objects are not provided.  Aborting custom-object association",
//       400
//     );
//   }

//   const endpoint = CRM_ASSOCIATION_V3.replace(
//     ":fromObjectType",
//     qualifiedName
//   ).replace(":toObjectType", "contact");

//   const inputs = [];
//   objects.forEach(item => {
//     inputs.push({
//       from: { id: item.objectId },
//       to: { id: contactId },
//       type: `${item.objectType}_to_contact`
//     });
//   });

//   // creating response
//   response = defaultRequestConfig();
//   response.endpoint = endpoint;
//   response.headers = {
//     "Content-Type": "application/json"
//   };
//   response.body.JSON = { inputs };

//   // choosing API Type
//   if (Config.authorizationType === "newPrivateAppApi") {
//     // Private Apps
//     response.headers = {
//       ...response.headers,
//       Authorization: `Bearer ${Config.accessToken}`
//     };
//   } else {
//     // use legacy API Key
//     response.params = { hapikey: Config.apiKey };
//   }

//   return response;
// };

/**
 * using legacy API
 * Ref - https://legacydocs.hubspot.com/docs/methods/enterprise_events/http_api
 * @param {*} message
 * @param {*} destination
 * @param {*} propertyMap
 * @returns
 */
const processLegacyTrack = async (message, destination, propertyMap) => {
  const { Config } = destination;
  let parameters = {
    _a: Config.hubID,
    _n: message.event,
    _m: get(message, "properties.revenue") || get(message, "properties.value"),
    id: getDestinationExternalID(message, "hubspotId")
  };

  parameters = removeUndefinedAndNullValues(parameters);
  const userProperties = await getTransformedJSON(
    message,
    hsCommonConfigJson,
    destination,
    propertyMap
  );

  const payload = { ...parameters, ...userProperties };
  const params = removeUndefinedAndNullValues(payload);

  const response = defaultRequestConfig();
  response.endpoint = TRACK_ENDPOINT;
  response.method = defaultGetRequestConfig.requestMethod;
  response.headers = {
    "Content-Type": "application/json"
  };

  // choosing API Type
  if (Config.authorizationType === "newPrivateAppApi") {
    // eslint-disable-next-line no-underscore-dangle
    delete params._a;
    response.headers = {
      ...response.headers,
      Authorization: `Bearer ${Config.accessToken}`
    };
  }
  response.params = params;

  return response;
};

const legacyBatchEvents = destEvents => {
  const batchedResponseList = [];
  const trackResponseList = [];
  const eventsChunk = [];
  destEvents.forEach(event => {
    // handler for track call
    if (event.message.method === "GET") {
      const { message, metadata, destination } = event;
      const endpoint = get(message, "endpoint");

      const batchedResponse = defaultBatchRequestConfig();
      batchedResponse.batchedRequest.headers = message.headers;
      batchedResponse.batchedRequest.endpoint = endpoint;
      batchedResponse.batchedRequest.body = message.body;
      batchedResponse.batchedRequest.params = message.params;
      batchedResponse.batchedRequest.method =
        defaultGetRequestConfig.requestMethod;
      batchedResponse.metadata = [metadata];
      batchedResponse.destination = destination;

      trackResponseList.push(
        getSuccessRespEvents(
          batchedResponse.batchedRequest,
          batchedResponse.metadata,
          batchedResponse.destination
        )
      );
    } else {
      // making chunks for identify
      eventsChunk.push(event);
    }
  });

  // eventChunks = [[e1,e2,e3,..batchSize],[e1,e2,e3,..batchSize]..]
  const arrayChunksIdentify = _.chunk(eventsChunk, MAX_BATCH_SIZE);

  // list of chunks [ [..], [..] ]
  arrayChunksIdentify.forEach(chunk => {
    const identifyResponseList = [];
    const metadata = [];

    // extracting destination, apiKey value
    // from the first event in a batch
    const { destination } = chunk[0];
    const { Config } = destination;

    let batchEventResponse = defaultBatchRequestConfig();

    chunk.forEach(ev => {
      // if source is of rETL
      if (ev.message.source === "rETL") {
        identifyResponseList.push({ ...ev.message.body.JSON });
        batchEventResponse.batchedRequest.body.JSON = {
          inputs: identifyResponseList
        };
        batchEventResponse.batchedRequest.endpoint = `${ev.message.endpoint}/batch/create`;
        metadata.push(ev.metadata);
      } else {
        const { email, updatedProperties } = getEmailAndUpdatedProps(
          ev.message.body.JSON.properties
        );
        // eslint-disable-next-line no-param-reassign
        ev.message.body.JSON.properties = updatedProperties;
        identifyResponseList.push({
          email,
          properties: ev.message.body.JSON.properties
        });
        metadata.push(ev.metadata);
        batchEventResponse.batchedRequest.body.JSON_ARRAY = {
          batch: JSON.stringify(identifyResponseList)
        };
        batchEventResponse.batchedRequest.endpoint = BATCH_CONTACT_ENDPOINT;
      }
    });

    batchEventResponse.batchedRequest.headers = {
      "Content-Type": "application/json"
    };

    // choosing API Type
    if (Config.authorizationType === "newPrivateAppApi") {
      // Private Apps
      batchEventResponse.batchedRequest.headers = {
        ...batchEventResponse.batchedRequest.headers,
        Authorization: `Bearer ${Config.accessToken}`
      };
    } else {
      // API Key
      batchEventResponse.batchedRequest.params = { hapikey: Config.apiKey };
    }

    batchEventResponse = {
      ...batchEventResponse,
      metadata,
      destination
    };
    batchedResponseList.push(
      getSuccessRespEvents(
        batchEventResponse.batchedRequest,
        batchEventResponse.metadata,
        batchEventResponse.destination,
        true
      )
    );
  });

  return batchedResponseList.concat(trackResponseList);
};

module.exports = {
  processLegacyIdentify,
  processLegacyTrack,
  legacyBatchEvents
};
