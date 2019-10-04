const fs = require("fs");
const path = require("path");
const gaTransformer = require("../v0/ga/transform");
const { compareJSON } = require("./util");

test("Google Analytics tests", () => {
  const inputDataFile = fs.readFileSync(
    path.resolve(__dirname, "./data/ga_input.json")
  );
  const outputDataFile = fs.readFileSync(
    path.resolve(__dirname, "./data/ga_output.json")
  );
  const inputData = JSON.parse(inputDataFile);
  const expectedData = JSON.parse(outputDataFile);
  const output = gaTransformer.process(inputData);
  // console.log(compareJSON(output, expectedData));
  expect(output).toEqual(expectedData);
});
