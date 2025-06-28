export let readerMapRegions = {
  dataType: "map regions",
  readData: function (context, computedPath) {
    // Implementation would go here - this is a placeholder for the map regions reader
    // Following the same pattern as other readers
    return {};
  },
  dataToUI: function (data) {
    return "Map: " + JSON.stringify(data);
  },
};
