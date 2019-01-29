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

let fileMeta = {};

let componentAnalyzer = function () {
  // console.log(Object.keys(babel.file));
  return {
    pre() {

    },
    visitor: {
      ImportDeclaration(path) {
        const source = path.node.source.value;
        fileMeta.imports.push(source);
      },
      ObjectProperty(path) {
        if (path.parent.type === "ObjectExpression") {
          const name = path.node.key.name;
          if (name === "actions") {
            fileMeta.actions = extractActions(path);
          } else if (name === "classNames") {
            fileMeta.classNames = extractClassNames(path);
          }
        }
      }
    },
    post(file) {
      file.metadata = fileMeta;
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
  fileMeta = {
    actions: [],
    imports: [],
    classNames: []
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

module.exports = {
  name: require("./package").name,
  serverMiddleware: function (config) {
    config.app.get("/_/files", this.onFile.bind(this));
  },
  showComponentInfo(data, relativePath) {
    resetJSMeta();
    const options = {
      plugins: [componentAnalyzer]
    };
    const meta = babel.transform(data, options).metadata;
    meta.imports = meta.imports.map((imp) => {
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
  },
  showComponentTemplateInfo(template) {
    resetHBSMeta();
    process(template);
    // let printed = glimmer.print(ast);
    return hbsMeta;
  },
  onFile(req, res) {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    const relativePath = normalizePath(req.query.item || "") || __dirname;
    // console.log('relativePath', relativePath);
    // console.log('endsWith - js', relativePath.endsWith('.js'));
    // console.log('relativePath - hbs', relativePath.endsWith('.hbs'));
    const root = serializePath(__dirname);
    if (relativePath.endsWith(".js")) {
      // console.log('read JS');
      fs.readFile(relativePath, "utf8", (err, data) => {
        return res.send({
          type: "component",
          path: req.query.item,
          data: this.showComponentInfo(data, relativePath),
          root
        });
      });
    } else if (relativePath.endsWith(".hbs")) {
      fs.readFile(relativePath, "utf8", (err, data) => {
        return res.send({
          type: "template",
          path: req.query.item,
          data: this.showComponentTemplateInfo(data),
          root
        });
      });
    } else {
      const files = fs
        .readdirSync(relativePath)
        .map(name => relativePath + path.sep + name)
        .map(serializePath).filter(filterPath);

      Promise.all(files.map(recursiveReadDirPromise)).then((results) => {
        const files = [].concat.apply([], results).sort().map(serializePath);
        res.send({
          type: "path",
          path: req.query.item,
          data: files,
          root
        });
      });

    }
  }
};
