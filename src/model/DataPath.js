export const dataPath = {
  validate: {
    isSimpleColumnName: function (value) {
      let simpleColumnName = new RegExp("^[a-zA-Z]+$", "gi");
      return simpleColumnName.test(value);
    },
    isDataPath(value) {
      let valueSplit = value.split(".");
      let correct = true;
      valueSplit.forEach(function (columnSegment) {
        if (!correct) {
          return;
        }
        let extendedColumnName = new RegExp(
          "^[a-zA-Z]+(([1-9]+[0-9]*)|#)?$",
          "gi"
        );
        if (extendedColumnName.test(columnSegment) == false) {
          correct = false;
        }
      });

      return correct;
    },
  },
  analyse: {
    position: function (allDataPaths, thisDataPath) {
      let result = {
        isLeaf: false,
        isRoot: false,
        hasChildren: false,
        isSimpleItem: false,
      };

      allDataPaths = allDataPaths.map(function (item) {
        return dataPath.modify.itemNumbersToHash(item).toLowerCase();
      });
      thisDataPath = dataPath.modify
        .itemNumbersToHash(thisDataPath)
        .toLowerCase();

      if (thisDataPath.indexOf(".") < 0 && thisDataPath.indexOf("#") < 0) {
        if (dataPath.analyse.hasChildren(allDataPaths, thisDataPath)) {
          //root item
          result.isLeaf = false;
          result.isRoot = true;
          result.hasChildren = true;
        } else {
          //simple item
          result.isLeaf = true;
          result.isRoot = true;
          result.hasChildren = false;
        }
      } else {
        if (dataPath.analyse.hasChildren(allDataPaths, thisDataPath)) {
          //middle item
          result.isLeaf = false;
          result.isRoot = false;
          result.hasChildren = true;
        } else {
          //leaf item
          result.isLeaf = true;
          result.isRoot = false;
          result.hasChildren = false;
        }
      }

      result.isSimpleItem =
        result.isLeaf && result.isRoot && !result.hasChildren;
      return result;
    },
    getChildrenOf(allDataPaths, parent) {
      parent = parent.toLowerCase();
      let children = [];

      allDataPaths.forEach(function (othertDataPath) {
        let other = othertDataPath.toLowerCase();
        if (other.startsWith(parent + ".") || other.startsWith(parent + "#")) {
          return children.push(other);
        }
      });

      return children;
    },
    hasChildren: function (allDataPaths, possibleParent) {
      return (
        dataPath.analyse.getChildrenOf(allDataPaths, possibleParent).length > 0
      );
    },
  },
  modify: {
    itemNumbersToHash: function (value) {
      return value.replace(/(\d+)/g, "#");
    },
    pathToSegments: function (path) {
      let split = path.split(/\.|#/);
      split = split.map(function (item) {
        if (item == "") {
          return "#";
        } else {
          return item;
        }
      });
      return split;
    },
    segmentsToPath: function (segments) {
      let path = "";

      for (let index = 0; index < segments.length; index++) {
        const segment = segments[index];

        if (segment == "#") {
          path = path + segment;
        } else {
          path = path + "." + segment;
        }
      }

      if (path.startsWith(".")) {
        path = path.substring(1);
      }

      return path;
    },
  },
};
