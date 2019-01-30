"use strict";
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const glimmer = require("@glimmer/syntax");
const recursive = require("recursive-readdir");

function serializePath(file) {
  return file.split(path.sep).join('/');
}

function normalizePath(file) {
  return file.split('/').join(path.sep);
}


function recursiveReadDirPromise(file) {
  return new Promise((resolve, reject) => {
    recursive(normalizePath(file), ["*.gitkeep", "*.css", ".less", ".scss", ".md"], function (err, files) {
      if (err) {
        reject(err);
      } else {
        resolve(files.filter(name => {
          let tail = name.split('.').pop();
          return tail === 'js' || tail === 'hbs';
        }));
      }
    });
  })
}

function filterPath(name) {
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
}

function extractActions(path) {
  return path.node.value.properties.map(node => {
    return {
      name: node.key.name,
      params: node.params.map(p => p.name)
    };
  });
}

function extractClassNames(path) {
  return path.node.value.elements.map(el => el.value);
}

let jsMeta = {};

let componentAnalyzer = function () {
  // console.log(Object.keys(babel.file));
  return {
    pre() {

    },
    visitor: {
      Program(path) {
        if (path.node.body.length === 2 && path.node.sourceType === 'module') {
          if (path.node.body[0].type === 'ImportDeclaration' && path.node.body[1].type === 'ExportDefaultDeclaration') {
            let exp = path.node.body[0].source.value;
            jsMeta.exports.push(exp);
          }
        }
        //path.node.name = path.node.name.split('').reverse().join('');
      },
      ExportNamedDeclaration(path) {
        const source = path.node.source.value;
        jsMeta.exports.push(source);
      },
      ImportDeclaration(path) {
        const source = path.node.source.value;
        jsMeta.imports.push(source);
      },
      ObjectExpression(path) {
        const methods = path.node.properties.filter((prop) => prop.type === 'ObjectMethod');
        methods.forEach((method) => {
          jsMeta.functions.push(method.key.name);
        })
      },
      ObjectProperty(path) {
        if (path.parent.type === "ObjectExpression") {
          const name = path.node.key.name;
          if (name === "actions") {
            jsMeta.actions = extractActions(path);
          } else if (name === "classNames") {
            jsMeta.classNames = extractClassNames(path);
          } else if (name === "tagName" && path.node.value.type === 'StringLiteral') {
            jsMeta.tagNames = [path.node.value.value];
          } else if (name === "attributeBindings") {
            jsMeta.attributeBindings = path.node.value.elements.map(el => el.value);
          } else if (name === "classNameBindings") {
            jsMeta.classNameBindings = path.node.value.elements.map(el => el.value);
          } else if (name === "concatenatedProperties") {
            jsMeta.concatenatedProperties = path.node.value.elements.map(el => el.value);
          } else if (name === "mergedProperties") {
            jsMeta.mergedProperties = path.node.value.elements.map(el => el.value);
          } else if (name === "positionalParams") {
            jsMeta.positionalParams = path.node.value.elements.map(el => el.value);
          }
        }
      }
    },
    post(file) {
      file.metadata = jsMeta;
      // console.log("exit", Object.keys(file));
    }
  };
};

function isLinkBlock(node) {
  if (node.type !== "BlockStatement") {
    return;
  }
  if (node.path.type !== "PathExpression") {
    return;
  }
  if (node.path.original !== "link-to") {
    return;
  }
  return true;
}

var hbsMeta = {};


function addUniqHBSMetaProperty(type, item) {
  if (hbsMeta[type].includes(item)) {
    return;
  }
  hbsMeta[type].push(item);
}

function resetHBSMeta() {
  hbsMeta = {
    paths: [],
    modifiers: [],
    arguments: [],
    properties: [],
    components: [],
    links: [],
    helpers: []
  };
}

function resetJSMeta() {
  jsMeta = {
    actions: [],
    imports: [],
    tagNames: [],
    functions: [],
    attributeBindings: [],
    positionalParams: [],
    concatenatedProperties: [],
    mergedProperties: [],
	classNameBindings: [],
	classNames: [],
    exports: []
  }
}

function process(template) {
  let plugin = function () {
    return {
      visitor: {
        BlockStatement(node) {
          if (isLinkBlock(node)) {
            const linkPath = node.path.parts[0];
            if (!hbsMeta.links.includes(linkPath)) {
              hbsMeta.links.push(linkPath);
            }
          }
        },
        ElementNode(item) {
          if (item.tag.charAt(0) === item.tag.charAt(0).toUpperCase()) {
            addUniqHBSMetaProperty('components', item.tag);
          }
        },
        PathExpression(item) {
          const pathOriginal = item.original;
          if (item.data === true) {
            if (item.this === false) {
              addUniqHBSMetaProperty('arguments', pathOriginal);
            }
          } else if (item.this === true) {
            addUniqHBSMetaProperty('properties', pathOriginal);
          } else {
            if (pathOriginal.includes('/')) {
              addUniqHBSMetaProperty('components', pathOriginal);
            } else if (pathOriginal.includes("-") && !pathOriginal.includes(".")) {
              addUniqHBSMetaProperty('helpers', pathOriginal);
            } else {
              addUniqHBSMetaProperty('paths', pathOriginal);
            }
          }
        },
        ElementModifierStatement(item) {
          hbsMeta.modifiers.push({
            name: item.path.original,
            param: item.params[0].original
          });
        }
      }
    };
  };
  return glimmer.preprocess(template, {
    plugins: {
      ast: [plugin]
    }
  });
}

function showComponentInfo(data, relativePath) {
  resetJSMeta();
  const options = {
    plugins: [componentAnalyzer]
  };
  const meta = babel.transform(data, options).metadata;
  meta.imports = meta.imports.map((imp) => {
    const paths = relativePath.split(path.sep);
    const base = imp.split('/')[0];
    paths.pop();
    if (imp.startsWith('.')) {
      const maybeFile = path.join(paths.join(path.sep), normalizePath(imp));
      const jsPath = maybeFile + '.js';
      const hbsPath = maybeFile + '.hbs';
      if (fs.existsSync(jsPath)) {
        return serializePath(jsPath);
      } else if (fs.existsSync(hbsPath)) {
        return serializePath(hbsPath);
      } else {
        return serializePath(maybeFile);
      }
    } else {
      if (imp.includes('/templates/components/')) {
        const pureImp = imp.replace(base, '');
        const [root] = serializePath(relativePath).split(base);
        const posiblePaths = [];
        posiblePaths.push(root + base + '/addon' + pureImp + '.js');
        posiblePaths.push(root + base + '/addon' + pureImp + '.hbs');
        posiblePaths.push(root + base + '/app' + pureImp + '.js');
        posiblePaths.push(root + base + '/app' + pureImp + '.hbs');
        let result = imp;
        posiblePaths.forEach((p) => {
          if (fs.existsSync(normalizePath(p))) {
            result = serializePath(p);
          }
        });
        return result;
      } else if (imp.includes('/mixins/')) {
        const pureImp = imp.replace(base, '');
        const [root] = serializePath(relativePath).split(base);
        const posiblePaths = [];
        posiblePaths.push(root + base + '/addon' + pureImp + '.js');
        let result = imp;
        posiblePaths.forEach((p) => {
          if (fs.existsSync(normalizePath(p))) {
            result = serializePath(p);
          }
        });
        return result;
      }
      return imp;
    }
  });
  meta.exports = meta.exports.map((imp) => {
    if (imp.startsWith('.')) {
      const paths = relativePath.split(path.sep);
      paths.pop();
      const maybeFile = path.join(paths.join(path.sep), normalizePath(imp));
      const jsPath = maybeFile + '.js';
      const hbsPath = maybeFile + '.hbs';
      if (fs.existsSync(jsPath)) {
        return serializePath(jsPath);
      } else if (fs.existsSync(hbsPath)) {
        return serializePath(hbsPath);
      } else {
        return serializePath(maybeFile);
      }
    } else {
      return imp;
    }
  });
  return meta;
}

function showComponentTemplateInfo(template) {
  resetHBSMeta();
  process(template);
  // let printed = glimmer.print(ast);
  return hbsMeta;
}

function getFileInformation(relativePath) {
  if (relativePath.endsWith('.js')) {
    return getComponentInformation(relativePath);
  } else {
    return getTemplateInformation(relativePath);
  }
}

module.exports = {
  name: require("./package").name,
  serverMiddleware: function (config) {
    config.app.get("/_/files", this.onFile.bind(this));
  },
  onFile(req, res) {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    const relativePath = normalizePath(req.query.item || "") || __dirname;
    const pathsToResolve = (req.query.paths && req.query.paths.length) ? req.query.paths.split(',').map(normalizePath) : [];
    const root = serializePath(__dirname);
    if (pathsToResolve.length) {
      Promise.all(pathsToResolve.map(getFileInformation)).then((result) => {
        res.send({
          type: 'results',
          data: result,
          root
        });
      });
    } else if (relativePath.endsWith(".js") || relativePath.endsWith(".hbs")) {
      getFileInformation(relativePath).then((result) => {
        result.path = req.query.item;
        result.root = root;
        res.send(result);
      });
    } else {
      getFilesFromPath(relativePath).then((result) => {
        result.path = req.query.item;
        result.root = root;
        res.send(result);
      });
    }
  }
};


function getFilesFromPath(relativePath) {
  if (!fs.existsSync(relativePath)) {
    return {
      type: "path",
      status: 404,
      data: []
    };
  }
  const files = fs
    .readdirSync(relativePath)
    .map(name => relativePath + path.sep + name)
    .map(serializePath).filter(filterPath);

  return Promise.all(files.map(recursiveReadDirPromise)).then((results) => {
    const files = [].concat.apply([], results).sort().map(serializePath);
    return {
      type: "path",
      data: files
    };
  });
}

function getComponentInformation(relativePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(relativePath, "utf8", (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          type: "component",
          relativePath: serializePath(relativePath),
          data: showComponentInfo(data, relativePath),
        });
      }
    });
  });
}

function getTemplateInformation(relativePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(relativePath, "utf8", (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          type: "template",
          relativePath: serializePath(relativePath),
          data: showComponentTemplateInfo(data),
        });
      }
    });
  });
}
