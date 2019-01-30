import Route from "@ember/routing/route";
import { inject as service } from "@ember/service";

function relativeName(absolute, root) {
  return absolute.replace(root + "/", "");
}

function buildGraph(components) {
    const root = {
        name: 'root',
        children: []
    };
    const hashMap = {

    };

    components.forEach((comp)=>{
        comp.paths.forEach((path)=>{
            hashMap[path.path] = path;
        });
    });
	const importsToPatch = [];
    components.forEach((comp)=>{
        let componentNode = {
            name: comp.name,
            children: []
        }
        comp.paths.forEach(componentPath=>{
            let node = {
                name: componentPath.name,
                path: componentPath.path,
                children: []
            };
            
            const imports = [];
            const args = [];
            const exp = [];
            (componentPath.meta.imports || []).forEach((name)=>{
				const importItem = {
                    name: name,
                    path: name,
                    children: []
                };
				//hashMap
				imports.push(importItem)
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
            (componentPath.meta.arguments || []).forEach((name)=>{
                args.push({
                    name: name,
                    path: name,
                    children: []
                })
            });
            (componentPath.meta.exports || []).forEach((name)=>{
                exp.push({
                    name: name,
                    path: name,
                    children: []
                })
            });
            if (imports.length) {
                node.children.push({
                    name: 'imports',
                    children: imports
                });
            }
            if (args.length) {
                node.children.push({
                    name: 'arguments',
                    children: args
                })
            }
            if (exp.length) {
                node.children.push({
                    name: 'exports',
                    children: exp
                })
            }
            componentNode.children.push(node);
        });
        root.children.push(componentNode);
	})
	
	root.children.forEach((compName)=>{
		compName.children = compName.children.filter((item=>{
			const imps = importsToPatch.filter(a=>item.name === a.name);
			if (imps.length) {
				imps.forEach((imp)=>{
					imp.children = item.children;
				});
				return false;
			} else {
				return true;
			}
		}));
	})
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
