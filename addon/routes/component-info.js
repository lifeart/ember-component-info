import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';

export default Route.extend({
  informator: service(),
  queryParams: {
    file: {
      refreshModel: true
    }
  },
  async model({
    file
  }) {
    const request = await fetch(`/_/files?item=${file ? encodeURIComponent(file) : ''}`);
    const result = await request.json();
    return this.filterResult(result);
  },
  filterResult(data) {
    data.isPath = data.type === 'path';
    data.isComponent = data.type === 'component';
    data.isTemplate = data.type === 'template';
    data.possibleName = (data.path || '').split('/').pop();
    data.relativePath = data.path.replace(data.root + '/', '');
    if (data.isPath) {
      data.data = data.data.map((path) => {
        return {
          path: path,
          name: path.replace(data.root + '/', ''),
          componentName: this.informator.extractComponentName(path, data.root)
        }
      }).filter(({componentName})=>componentName !== '<UNKNOWN>');
      data.resolvedComponents = data.data.reduce((result, item)=>{
          const group = result.filter(prop => prop.name === item.componentName)[0];
          if (group) {
            group.paths.push(item)
          } else {
              result.push({
                  name: item.componentName,
                  paths: [ item ]
              })
          }
          return result;
      }, []);
	} else if (data.isComponent) {
		data.data.imports = data.data.imports.map((name)=>{
			return {
				isLinkable: name.endsWith('.hbs') || name.endsWith('.js'),
				relativeName: name.replace(data.root + '/', ''),
				name
			}
		});
	}
    return data;
  },
  setupController(controller, model) {
    if (!controller.queryParams) {
      controller.set('queryParams', ['path']);
      controller.set('file', null);
    }
    this._super(...arguments);
    if (model.isPath) {
      controller.set('paths', model);
    } else if (model.isComponent) {
		controller.set('component', model);
	} else if (model.isTemplate) {
		controller.set('template', model);
	}
  }
});
