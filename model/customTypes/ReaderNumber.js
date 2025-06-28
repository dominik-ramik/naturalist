import { readDataFromPath } from "./index.js";
import { Logger } from "../../components/Logger.js";

export let readerNumber = {
  dataType: "number",
  readData: function (context, computedPath) {
    let rawValue = readDataFromPath(context, computedPath, {});

    // Return null for invalid input types (only strings and numbers are acceptable)
    if (
      !(typeof rawValue === "string" && rawValue.length > 0) &&
      typeof rawValue !== "number"
    ) {
      return null;
    }

    // Parse the value based on its type
    let parsedNumber;
    if (typeof rawValue === "number") {
      parsedNumber = rawValue;
    } else if (Number.isInteger(Number(rawValue))) {
      parsedNumber = parseInt(rawValue, 10);
    } else {
      parsedNumber = parseFloat(rawValue);
    }

    // Validate the parsed result
    if (Number.isNaN(parsedNumber)) {
      Logger.error(`Value not a number: ${rawValue} in ${computedPath}`);
      return null;
    }

    return parsedNumber;
  },
  dataToUI: function (data) {
    return "UI: " + data;
  },
};
