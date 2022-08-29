/* eslint-disable no-return-assign, no-param-reassign, no-restricted-syntax */
const get = require("get-value");
const { CustomError, getFieldValueFromMessage } = require("../../util");
const { lookupFieldMap } = require("./config");
const { httpGET } = require("../../../adapters/network");
const {
  processAxiosResponse
} = require("../../../adapters/utils/networkUtils");
/**
 * @param {*} propertyName
 * @param {*} value
 * @returns  Axios call Url
 * creates the axios url using the propertyName and Value for filters
 */
function createAxiosUrl(propertyName, value, baseUrl) {
  return `${baseUrl}/contacts?where%5B0%5D%5Bcol%5D=${propertyName}&where%5B0%5D%5Bexpr%5D=eq&where%5B0%5D%5Bval%5D=${value}`;
}
/**
 * @param {*} inputText
 * @returns Boolean Value
 * for validating email match
 */
function validateEmail(inputText) {
  const mailformat = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,3}$/;
  return mailformat.test(inputText);
}
/**
 * @param {*} message
 * @param {*} lookUpField
 * @returns field and field value
 * searches for lookup field firstly and then tries with the email field
 * and if both are ot there then we return null for both field and fieldValue
 */
const getFieldForLookup = (message, lookUpField) => {
  let field = null;
  let fieldValue = null;
  for (const fieldIterator of lookupFieldMap[lookUpField].sourceKeys) {
    fieldValue = get(message, fieldIterator);
    if (fieldValue) {
      field = lookupFieldMap[lookUpField].destKeys;
      return { field, fieldValue };
    }
  }
  fieldValue = getFieldValueFromMessage(message, "email");
  if (fieldValue) {
    field = "email";
  }
  return { field, fieldValue };
};

/**
 * @param {*} inputText
 * @returns Boolean Value
 * for validating Phone match
 * */
function validatePhone(inputText) {
  const phoneno = /^\d{10}$/;
  return phoneno.test(inputText);
}
/**
 * @param {*} message
 * @returns addres1 and address2
 * Constructs the address1 and address2 field
 * if address is given as string or object and throws error if address string
 * is greater than 128
 * */
const deduceAddressFields = message => {
  let extractedAddress = getFieldValueFromMessage(message, "address");
  let address1;
  let address2;
  if (extractedAddress) {
    if (typeof extractedAddress === "object") {
      if (
        Object.keys(extractedAddress).includes("addressLine1") &&
        Object.keys(extractedAddress).includes("addressLine2")
      ) {
        address1 = extractedAddress.addressLine1;
        address2 = extractedAddress.addressLine2;
        return { address1, address2 };
      }
      extractedAddress = Object.keys(extractedAddress).reduce((res, v) => {
        return res.concat(extractedAddress[v], " ");
      }, "");
    }
    const validLengthAddress =
      extractedAddress.length > 128
        ? extractedAddress.substring(0, 127)
        : extractedAddress;
    address1 = validLengthAddress.substring(0, 63);
    address2 = validLengthAddress.substring(64, validLengthAddress.length);
  }
  return { address1, address2 };
};

/**
 * 
 * @param {*} payload 
 * Works on the state field of Payload for its Conversion to Valid Case 
 */
const deduceStateField = payload =>{
  if (
    payload.state &&
    payload.state.length > 1 &&
    payload.state[0] !== payload.state[0].toUpperCase()
  ) {
    payload.state = payload.state[0].toUpperCase() + payload.state.substring(1);
  }
}

/**
 * @param {*} payload
 * @returns true if no error is there
 * else, throws an error
 * Validates the generated payload for specific fields
 */
const validatePayload = payload => {

  if (payload.phone && !validatePhone(payload.phone)) {
    throw new CustomError("Invalid Phone No. Provided.", 400);
  }
  
  if (payload.email && !validateEmail(payload.email)) {
    delete payload.email;
  }
  return true;
};

/**
 * @param {*} message
 * checks if the mandatory fields for the group call are given or not
 */
const validateGroupCall = message => {
  const type = getFieldValueFromMessage(message, "traits")?.type;
  if (!type) {
    throw new CustomError("Type of group not mentioned inside traits", 400);
  }
  if (!message?.groupId) {
    throw new CustomError("Group Id is not provided.", 400);
  }
};

/**
 *
 * @param {*} message
 * @param {*} destination
 * @returns contacts
 * It checks for lookUpfield Validation and make axios call ,if Valid, and returns the contactIDs received.
 * It Gets the contact Id using Lookup field and then email, otherwise returns null
 */
const searchContactIds = async (message, Config, baseUrl) => {
  const { lookUpField, userName, password } = Config;

  const traits = getFieldValueFromMessage(message, "traits");
  if (!traits) {
    throw new CustomError("Invalid traits value for lookup field", 400);
  }
  if (lookUpField && !Object.keys(lookupFieldMap).includes(lookUpField)) {
    throw new CustomError("lookup Field is not supported", 400);
  }
  const { field, fieldValue } = getFieldForLookup(message, lookUpField);
  if (!field) {
    return null;
  }
  const basicAuth = Buffer.from(`${userName}:${password}`).toString("base64");
  const requestOptions = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basicAuth}`
    }
  };
  let searchContactsResponse = await httpGET(
    createAxiosUrl(field, fieldValue, baseUrl),
    requestOptions
  );
  searchContactsResponse = processAxiosResponse(searchContactsResponse);
  if (searchContactsResponse.status !== 200) {
    throw new CustomError(
      `Failed to get Mautic contacts: ${JSON.stringify(
        searchContactsResponse.response
      )}`,
      searchContactsResponse.status
    );
  }
  const { contacts } = searchContactsResponse?.response;
  if (!contacts) {
    return null;
  }
  return Object.keys(contacts);
};

module.exports = {
  deduceStateField,
  validateEmail,
  validatePhone,
  deduceAddressFields,
  validateGroupCall,
  validatePayload,
  searchContactIds
};
