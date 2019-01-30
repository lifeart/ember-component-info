import Route from "@ember/routing/route";
import { inject as service } from "@ember/service";

function relativeName(absolute, root) {
  return absolute.replace(root + "/", "");
}

function buildGraph(components) {
  const root = {
    name: "components",
    children: []
  };
  const hashMap = {};

  components.forEach(comp => {
    comp.paths.forEach(path => {
      hashMap[path.path] = path;
    });
  });
  const importsToPatch = [];
  const exportsToPatch = [];
  components.forEach(comp => {
    let componentNode = {
      name: comp.name,
      children: []
    };
    comp.paths.forEach(componentPath => {
      let node = {
        name: componentPath.name,
        path: componentPath.path,
        children: []
      };

      const imports = [];
      const exp = [];

      const possibleArrays = [
        "classNameBindings",
        "functions",
        "actions",
        "positionalParams",
        "concatenatedProperties",
        "mergedProperties",
        "attributeBindings",
        "classNames",
        "tagNames",
        "arguments",
        "helpers",
        "links",
        "components",
        "properties",
        "paths",
        "computeds",
        "props"
      ];

      possibleArrays.forEach(prop => {
        let tmp = [];
        (componentPath.meta[prop] || []).forEach(name => {
          tmp.push({
            name: name,
            children: []
          });
        });
        if (tmp.length) {
          node.children.push({
            name: prop,
            children: tmp
          });
        }
      });

      (componentPath.meta.imports || []).forEach(name => {
        const importItem = {
          name: name,
          path: name,
          children: []
        };
        //hashMap
        imports.push(importItem);
        if (hashMap[name]) {
          importItem.name = hashMap[name].name;
          // console.log('hashMap[name]', hashMap[name]);
          const importField = {
            name: hashMap[name].name,
            children: []
          };

          importsToPatch.push(importField);
          importItem.children.push(importField);
        }
      });

      (componentPath.meta.exports || []).forEach(rawName => {
        // console.log('rawName', rawName);
        const name =
          "addon/components/" + rawName.split("/components/")[1] + ".js";

        const exportItem = {
          name: name,
          path: name,
          children: []
        };

        exportsToPatch.push(exportItem);
        exp.push(exportItem);
      });
      if (imports.length) {
        node.children.push({
          name: "imports",
          children: imports
        });
      }

      if (exp.length) {
        node.children.push({
          name: "exports",
          children: exp
        });
      }
      componentNode.children.push(node);
    });
    root.children.push(componentNode);
  });
  if (false) {
    root.children.forEach(compName => {
      compName.children = compName.children.filter(item => {
        const imps = importsToPatch.filter(a => {
          const hasEqualNames = item.name === a.name;
          return hasEqualNames;
          // const endsWithName = item.name.endsWith(a.name);
          // const normalizedEndsWith = item.name.replace('/addon', '').endsWith(a.name);
          // const noextEndsWith = item.name.replace('/addon', '').replace('.js', '').endsWith(a.name)
          // return hasEqualNames || endsWithName || normalizedEndsWith || noextEndsWith;
        });
        if (imps.length) {
          imps.forEach(imp => {
            imp.children = imp.children.concat(item.children);
          });
          return false;
        } else {
          return true;
        }
      });
    });
    root.children.forEach(compName => {
      compName.children = compName.children.filter(item => {
        const imps = exportsToPatch.filter(a => {
          const hasEqualNames = item.name === a.name;
          return hasEqualNames;
          // const endsWithName = item.name.endsWith(a.name);
          // const normalizedEndsWith = item.name.replace('/addon', '').endsWith(a.name);
          // const noextEndsWith = item.name.replace('/addon', '').replace('.js', '').endsWith(a.name)
          // return hasEqualNames || endsWithName || normalizedEndsWith || noextEndsWith;
        });
        if (imps.length) {
          imps.forEach(imp => {
            imp.children = imp.children.concat(item.children);
          });
          return false;
        } else {
          return true;
        }
      });
    });
  }
  return [root];
}

export default Route.extend({
  informator: service(),
  queryParams: {
    file: {
      refreshModel: true
    }
  },
  async model({ file }) {
    const request = await fetch(
      `/_/files?item=${file ? encodeURIComponent(file) : ""}`
    );
    const result = await request.json();
    const final = await this.filterResult(result);
    return final;
  },
  async filterResult(data) {
    data.isPath = data.type === "path";
    data.isComponent = data.type === "component";
    data.isTemplate = data.type === "template";
    data.possibleName = (data.path || "").split("/").pop();
    data.relativePath = relativeName(data.path, data.root);
    if (data.isPath) {
      data.data = data.data
        .map(path => {
          return {
            path: path,
            name: relativeName(path, data.root),
            componentName: this.informator.extractComponentName(path, data.root)
          };
        })
        .filter(({ componentName }) => componentName !== "<UNKNOWN>");
      const resolvedPaths = [];
      data.resolvedComponents = data.data.reduce((result, item) => {
        const group = result.filter(
          prop => prop.name === item.componentName
        )[0];
        resolvedPaths.push(item.path);
        if (group) {
          group.paths.push(item);
        } else {
          result.push({
            name: item.componentName,
            paths: [item]
          });
        }
        return result;
      }, []);
      const results = await this.informator.getMeta(resolvedPaths);
      let resultsData = results.data;
      data.resolvedComponents.forEach(comp => {
        comp.paths.forEach(p => {
          const meta = resultsData.filter(
            item => item.relativePath === p.path
          )[0];
          p.meta = meta ? meta.data : null;
        });
      });
      this.informator.set("componentsArray", data.resolvedComponents);
      let items = data.resolvedComponents.map(item =>
        this.informator.extractComponentInformation(item.name)
      );
      console.log("items", items);
      console.log("data.resolvedComponents", data.resolvedComponents);
      data.graph = buildGraph(data.resolvedComponents);
    } else if (data.isComponent) {
      data.data.imports = data.data.imports.map(name => {
        return {
          isLinkable: name.endsWith(".hbs") || name.endsWith(".js"),
          relativeName: relativeName(name, data.root),
          name
        };
      });
    }
    return data;
  },
  setupController(controller, model) {
    if (!controller.queryParams) {
      controller.set("queryParams", ["path"]);
      controller.set("file", null);
    }
    this._super(...arguments);
    if (model.isPath) {
      controller.set("paths", model);
    } else if (model.isComponent) {
      controller.set("component", model);
    } else if (model.isTemplate) {
      controller.set("template", model);
    }
  }
});
