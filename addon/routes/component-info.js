import Route from "@ember/routing/route";
import { inject as service } from "@ember/service";

function relativeName(absolute, root) {
  return absolute.replace(root + "/", "");
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
