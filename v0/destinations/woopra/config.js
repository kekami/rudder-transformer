const { getMappingConfig } = require("../../util");

const BASE_URL = "https://www.woopra.com/track";
const ConfigCategories = {
  TRACK: {
    type: "track",
    name: "WoopraTrackConfig"
  },
  IDENTIFY: {
    type: "identify",
    name: "WoopraIdentifyConfig"
  },
  PAGE: {
    type: "page",
    name: "WoopraPageConfig"
  }
};

// fields that are already generating through configuration files
const genericFields = [
  "email",
  "title",
  "birthday",
  "dateOfBirth",
  "dob",
  "DOB",
  "dateofbirth",
  "age",
  "id",
  "userId",
  "firstName",
  "firstname",
  "first_name",
  "lastName",
  "lastname",
  "last_name",
  "middleName",
  "middlename",
  "middle_name",
  "phone",
  "state",
  "country",
  "name",
  "city",
  "website",
  "zipcode"
];
const mappingConfig = getMappingConfig(ConfigCategories, __dirname);
module.exports = {
  BASE_URL,
  mappingConfig,
  ConfigCategories,
  genericFields
};
