import Service from "@ember/service";

export default Service.extend({
  init() {
    this._super(...arguments);
    this.set("paths", []);
    this.set("componentsArray", []);
  },
  paths: null,
  componentsArray: null,
  rootPath: "",
  _pathWithoutExtension(path) {
    const keys = path.split(".");
    keys.pop();
    return keys.join(".");
  },
  _relativePath(path) {
    return path.replace(this.rootPath, "");
  },
  async getMeta(paths) {
    const q = encodeURIComponent(paths.join(","));
    const request = await fetch(`/_/files?paths=${q}`);
    const result = await request.json();
    console.log(result);
    return result;
  },
  _extractComponentNameTail(path) {
    const purePath = this._relativePath(this._pathWithoutExtension(path));
    if (purePath.endsWith("/component")) {
      return purePath.replace("/component", "");
    } else if (purePath.indexOf("/components/") > -1) {
      return purePath.split("/components/")[1];
    } else if (purePath.indexOf("/-components") > -1) {
      return purePath.split("/-components")[1];
    } else if (purePath.indexOf("/templates/") > -1) {
      return undefined;
    } else if (purePath.indexOf("/routes/")) {
      return undefined;
    } else {
      return purePath;
    }
  },
  extractComponentName(path, rootPath = "") {
    if (!path) {
      return "";
    }
    if (rootPath !== "") {
      this.set("rootPath", rootPath);
    }
    const tail = this._extractComponentNameTail(path);
    if (!tail) {
      return "<UNKNOWN>";
    }
    if (tail.startsWith("app")) {
      return tail.replace("app/", "");
    } else if (tail.startsWith("addon")) {
      return tail.replace("addon/", "");
    } else if (tail.startsWith("src")) {
      return tail.replace("src/", "");
    }
    return tail;
  },
  async lookupComponentInfo(path) {
    //...
  },
  extractComponentInformation(componentName) {
    const files = this.componentsArray.filter(
      item => item.name === componentName
    );
    if (!files.length) {
      return null;
    }
    const componentInformation = {};
    componentInformation.name = componentName;
    componentInformation.jsProps = [];
    componentInformation.jsComputeds = [];
    componentInformation.jsFunc = [];
    componentInformation.jsImports = [];
    componentInformation.hbsComponents = [];
    componentInformation.hbsProps = [];

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

    const meta = files[0].paths.reduce((result, it) => {
      Object.keys(it.meta).forEach(name => {
        if (name in result) {
          result[name] = result[name].concat(it.meta[name]);
        } else {
          result[name] = it.meta[name];
        }
      });
      return result;
    }, {});

    (meta.computeds || []).forEach(value => {
      componentInformation.jsComputeds.push(value);
    });
    (meta.props || []).forEach(value => {
      componentInformation.jsProps.push(value);
    });
    (meta.functions || []).forEach(value => {
      componentInformation.jsFunc.push(value);
    });
    (meta.actions || []).forEach(value => {
      componentInformation.api.actions.push(value);
    });
    (meta.tagNames || []).forEach(value => {
      componentInformation.api.tagName = value;
    });
    (meta.attributeBindings || []).forEach(value => {
      componentInformation.api.attributeBindings.push(value);
    });
    (meta.classNames || []).forEach(value => {
      componentInformation.api.classNames.push(value);
    });
    (meta.mergedProperties || []).forEach(value => {
      componentInformation.api.mergedProperties.push(value);
    });
    (meta.concatenatedProperties || []).forEach(value => {
      componentInformation.api.concatenatedProperties.push(value);
    });
    (meta.positionalParams || []).forEach(value => {
      componentInformation.api.positionalParams.push(value);
    });
    (meta.classNameBindings || []).forEach(value => {
      componentInformation.api.classNameBindings.push(value);
    });
    (meta.components || []).forEach(value => {
      componentInformation.hbsComponents.push(value);
    });
    (meta.paths || []).forEach(value => {
      componentInformation.hbsProps.push(value);
    });
    (meta.imports || []).forEach(value => {
      componentInformation.jsImports.push(value);
    });
    (meta.properties || []).forEach(value => {
      const localName = value.split(".")[1];
      // @danger!
      meta.unknownProps.push(localName);
      componentInformation.hbsProps.push(value);
    });
    (meta.arguments || []).forEach(value => {
      const localName = value.split(".")[0].replace("@", "");
      // @danger!
      meta.unknownProps.push(localName);
      componentInformation.hbsProps.push(value);
    });
    (meta.unknownProps || []).forEach(rawName => {
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
      const hasJsFunc = componentInformation.jsComputeds.filter(name =>
        name.startsWith(path)
      );
      if (hasJsProp.length) {
        return `${name} as this.${hasJsProp[0]}`;
      } else if (hasComputed.length) {
        return `${name} as this.${hasComputed[0]}`;
      } else if (hasJsFunc.length) {
        return `${name} as this.${hasJsFunc[0]}`;
      } else {
        return name;
      }
    });

    return componentInformation;
  }
});
