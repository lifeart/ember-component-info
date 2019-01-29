import Route from '@ember/routing/route';

export default Route.extend({
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
          name: path.replace(data.root + '/', '')
        }
      })
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
