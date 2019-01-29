import Service from '@ember/service';

export default Service.extend({
    init() {
        this._super(...arguments);
        this.set('paths', []);
    },
    paths: null,
    rootPath: '',
    _pathWithoutExtension(path) {
        const keys = path.split('.');
        keys.pop();
        return keys.join('.');
    },
    _relativePath(path) {
        return path.replace(this.rootPath, '');
    },
    async getMeta(paths) {
        const q = encodeURIComponent(paths.join(','));
        const request = await fetch(`/_/files?paths=${q}`);
        const result = await request.json();
        console.log(result);
        return result;
    },
    _extractComponentNameTail(path) {
        const purePath = this._relativePath(this._pathWithoutExtension(path));
        if (purePath.endsWith('/component')) {
            return purePath.replace('/component', '');
        } else if (purePath.indexOf('/components/') > -1) {
            return purePath.split('/components/')[1];
        } else if (purePath.indexOf('/-components') > -1) {
            return purePath.split('/-components')[1];
        } else if (purePath.indexOf('/templates/') > -1) {
            return undefined;
        } else if (purePath.indexOf('/routes/')) {
            return undefined;
        } else {
            return purePath;
        }
    },
    extractComponentName(path, rootPath = '') {
        if (!path) {
            return '';
        }
        if (rootPath !== '') {
            this.set('rootPath', rootPath);
        }
        const tail = this._extractComponentNameTail(path);
        if (!tail) {
            return '<UNKNOWN>';
        }
        if (tail.startsWith('app')) {
            return tail.replace('app/', '')
        } else if (tail.startsWith('addon')) {
            return tail.replace('addon/', '');
        } else if (tail.startsWith('src')) {
            return tail.replace('src/','');
        }
        return tail;
    },
    async lookupComponentInfo(path) {
        //...
    }
});
