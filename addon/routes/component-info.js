import Route from '@ember/routing/route';

export default Route.extend({
    queryParams: {
        file: {
            refreshModel: true
        }
    },
    async  model({file}) {
        const request = await fetch(`/_/files?item=${file ? encodeURIComponent(file) : ''}`);
        const result = await request.json();
        return this.filterResult(result);
    },
    filterResult(data) {
        if (data.type === 'path') {
            data.data = data.data.filter((name)=>{
                if (name.includes('/.')) {
                    return false;
                }
                const lastPath = name.split('/').pop();
             
                if ([
                    'tmp',
                    'vendor',
                    'node_modules',
                    'tests',
                    'ember-cli-build.js',
                    'index.js',
                    'dist',
                    'testem.js',
                    'config'
                ].includes(lastPath)) {
                    return false;
                }
                if (lastPath.indexOf('.') === -1) {
                    return true;
                }
                return lastPath.endsWith('.js') || lastPath.endsWith('.hbs');
            });
        }
        data.isPath = data.type === 'path';
        data.isComponent = data.type === 'component';
        data.isTemplate = data.type === 'template';
        data.possibleName = (data.path || '').split('/').pop();
        return data;
    },
    setupController(controller) {
        if (!controller.queryParams) {
            controller.set('queryParams', ['path']);
            controller.set('file', null);
        }
        this._super(...arguments);
    }
});
