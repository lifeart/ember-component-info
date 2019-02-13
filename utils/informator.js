"use strict";

/* eslint-env node */


function eachValue(arr, cb) {
    if (!arr || !Array.isArray(arr)) {
        return;
    }
    arr.forEach(cb);
}

function extractComponentInformationFromMeta(meta) {
    if (!meta) {
        return null;
    }

    const componentInformation = {};
    componentInformation.name = '<COMPONENT_NAME>';
    componentInformation.jsProps = [];
    componentInformation.jsComputeds = [];
    componentInformation.jsFunc = [];
    componentInformation.jsImports = [];
    componentInformation.hbsComponents = [];
    componentInformation.hbsProps = [];
    componentInformation.hbsHelpers = [];

    componentInformation.api = {
      actions: [],
      tagName: "div",
      attributeBindings: [],
      mergedProperties: [],
      classNameBindings: [],
      concatenatedProperties: [],
      positionalParams: [],
      classNames: []
    };

    // const meta = fileMeta.paths.reduce((result, it) => {
    //   Object.keys(it.meta).forEach(name => {
    //     if (name in result) {
    //       result[name] = result[name].concat(it.meta[name]);
    //     } else {
    //       result[name] = it.meta[name];
    //     }
    //   });
    //   return result;
    // }, {});

    eachValue(meta.computeds, value => {
      componentInformation.jsComputeds.push(value);
    });
    eachValue(meta.props, value => {
      componentInformation.jsProps.push(value);
    });
    eachValue(meta.functions, value => {
      componentInformation.jsFunc.push(value);
    });
    eachValue(meta.actions, value => {
      componentInformation.api.actions.push(value);
    });
    eachValue(meta.tagNames, value => {
      componentInformation.api.tagName = value;
    });
    eachValue(meta.attributeBindings, value => {
      componentInformation.api.attributeBindings.push(value);
    });
    eachValue(meta.classNames ,value => {
      componentInformation.api.classNames.push(value);
    });
    eachValue(meta.mergedProperties, value => {
      componentInformation.api.mergedProperties.push(value);
    });
    eachValue(meta.concatenatedProperties, value => {
      componentInformation.api.concatenatedProperties.push(value);
    });
    eachValue(meta.positionalParams, value => {
      componentInformation.api.positionalParams.push(value);
    });
    eachValue(meta.classNameBindings, value => {
      componentInformation.api.classNameBindings.push(value);
    });
    eachValue(meta.components, value => {
      componentInformation.hbsComponents.push(value);
    });
    eachValue(meta.helpers, value => {
      componentInformation.hbsHelpers.push(value);
    });
    eachValue(meta.paths, value => {
      componentInformation.hbsProps.push(value);
    });
    eachValue(meta.imports, value => {
      componentInformation.jsImports.push(value);
    });
    eachValue(meta.properties, value => {
      const localName = value.split(".")[1];
      // @danger!
      meta.unknownProps.push(localName);
      componentInformation.hbsProps.push(value);
    });
    eachValue(meta.arguments, value => {
      const localName = value.split(".")[0].replace("@", "");
      // @danger!
      meta.unknownProps.push(localName);
      componentInformation.hbsProps.push(value);
    });
    eachValue(meta.unknownProps, rawName => {
      // currentMedia.[]
      if (!rawName) {
        return;
      }
      const propName = rawName.split(".")[0];
      const existingProps = componentInformation.jsProps.filter(name =>
        name.startsWith(propName + " ")
      );
      if (!existingProps.length) {
        let value = "undefined";
        if (rawName.includes(".[]") || rawName.endsWith(".length")) {
          if (rawName.split(".").length === 2) {
            value = "[...]";
          }
        } else if (rawName.includes("{")) {
          value = "{...}";
        } else if (rawName.includes(".@each")) {
          if (rawName.split(".").length === 3) {
            value = "[{..}]";
          }
        } else if (
          rawName.includes(".") &&
          !rawName.includes("[") &&
          !rawName.includes("{")
        ) {
          value = "{...}";
        }
        componentInformation.jsProps.push(`${propName} = ${value}`);
      }
    });

    componentInformation.jsProps.sort((a, b) => {
      if (a.endsWith("= undefined") && !b.endsWith("= undefined")) {
        return -1;
      } else if (!a.endsWith("= undefined") && b.endsWith("= undefined")) {
        return 1;
      }
      if (a.includes("(") && !b.includes("(")) {
        return -1;
      } else if (!a.includes("(") && b.includes("(")) {
        return 1;
      }
      if (a.charAt(0) === b.charAt(0)) {
        let diff = a.split(" ")[0].length - b.split(" ")[0].length;
        if (diff !== 0) {
          return diff;
        }
      }
      return a.split(" ")[0].localeCompare(b.split(" ")[0]);
    });
    componentInformation.jsComputeds.sort((a, b) => {
      if (a.endsWith("= undefined") && !b.endsWith("= undefined")) {
        return -1;
      } else if (!a.endsWith("= undefined") && b.endsWith("= undefined")) {
        return 1;
      }
      if (a.includes("(") && !b.includes("(")) {
        return -1;
      } else if (!a.includes("(") && b.includes("(")) {
        return 1;
      }
      if (a.charAt(0) === b.charAt(0)) {
        let diff = a.split(" ")[0].length - b.split(" ")[0].length;
        if (diff !== 0) {
          return diff;
        }
      }
      return a.split(" ")[0].localeCompare(b.split(" ")[0]);
    });
    componentInformation.jsFunc.sort((a, b) => {
      let diff = a.split("(")[0].length - b.split("(")[0].length;
      if (diff !== 0) {
        return diff;
      }

      return a.split("(")[0].localeCompare(b.split("(")[0]);
    });
    componentInformation.api.actions.sort();
    componentInformation.api.attributeBindings.sort();
    componentInformation.hbsProps = componentInformation.hbsProps.map(name => {
      const path = name.split(".")[0];
      const hasJsProp = componentInformation.jsProps.filter(name =>
        name.startsWith(path + " ")
      );
      const hasComputed = componentInformation.jsComputeds.filter(name =>
        name.startsWith(path + " ")
      );
      const hasJsFunc = componentInformation.jsFunc.filter(name =>
        name.startsWith(path)
      );
      if (hasJsProp.length) {
        return `${name} as this.${hasJsProp[0]}`;
      } else if (hasComputed.length) {
        return `${name} as this.${hasComputed[0]}`;
      } else if (hasJsFunc.length) {
        return `${name} as this.${hasJsFunc[0]}`;
      } else {
        if (name !== "this") {
          if (
            name.includes(".") &&
            !name.startsWith("@") &&
            !name.startsWith("this.")
          ) {
            componentInformation.jsProps.push(
              `${name.split(".")[0]} = undefined // (used in template)`
            );
          } else {
            componentInformation.jsProps.push(
              `${name} = undefined // (used in template)`
            );
          }

          return `${name} as used in template`;
        } else {
          return name;
        }
      }
    });

    return componentInformation;
}

module.exports = { extractComponentInformationFromMeta }