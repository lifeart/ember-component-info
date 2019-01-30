"use strict";
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const glimmer = require("@glimmer/syntax");
const recursive = require("recursive-readdir");

function serializePath(file) {
  return file.split(path.sep).join("/");
}

function normalizePath(file) {
  return file.split("/").join(path.sep);
}

function recursiveReadDirPromise(file) {
  return new Promise((resolve, reject) => {
    recursive(
      normalizePath(file),
      ["*.gitkeep", "*.css", ".less", ".scss", ".md"],
      function(err, files) {
        if (err) {
          reject(err);
        } else {
          resolve(
            files.filter(name => {
              let tail = name.split(".").pop();
              return tail === "js" || tail === "hbs";
            })
          );
        }
      }
    );
  });
}

function filterPath(name) {
  if (name.includes("/.")) {
    return false;
  }
  const lastPath = name.split("/").pop();

  if (
    [
      "tmp",
      "vendor",
      "node_modules",
      "tests",
      "ember-cli-build.js",
      "index.js",
      "dist",
      "testem.js",
      "config"
    ].includes(lastPath)
  ) {
    return false;
  }
  if (lastPath.indexOf(".") === -1) {
    return true;
  }
  return isSupportedFileType(lastPath);
}

function extractActions(path) {
  return path.node.value.properties.map(node => {
    const params = node.params.map(p=>p.name);
    return `${node.key.name}(${params.join(', ')})`;
  });
}

function extractClassNames(path) {
  return path.node.value.elements.map(el => el.value);
}

let jsMeta = {};

function looksLikeReexport(path) {
  if (path.node.body.length === 2 && path.node.sourceType === "module") {
    const childs = path.node.body;
    if (
      childs[0].type === "ImportDeclaration" &&
      childs[1].type === "ExportDefaultDeclaration"
    ) {
      return true;
    }
  }
  return false;
}

let componentAnalyzer = function() {
  // console.log(Object.keys(babel.file));
  return {
    pre() {},
    visitor: {
      Program(path) {
        if (looksLikeReexport(path)) {
          jsMeta.exports.push(path.node.body[0].source.value);
        }
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
        const methods = path.node.properties.filter(
          prop => prop.type === "ObjectMethod"
        );
        methods.forEach(method => {
          const params = method.params.map(p=>p.name);
          jsMeta.functions.push(`${method.key.name}(${params.join(', ')})`);
        });
      },
      ObjectProperty(path) {
        if (path.parent.type === "ObjectExpression" 
          && !path.scope.parent) {
          const valueType = path.node.value.type;
          const name = path.node.key.name;
          const valueElements = path.node.value.elements || [];
          if (name === "actions") {
            jsMeta.actions = extractActions(path);
          } else if (name === "classNames") {
            jsMeta.classNames = extractClassNames(path);
          } else if (
            name === "tagName" &&
            valueType === "StringLiteral"
          ) {
            jsMeta.tagNames = [path.node.value.value];
          } else if (name === "attributeBindings") {
            jsMeta.attributeBindings = valueElements.map(
              el => el.value
            );
          } else if (name === "classNameBindings") {
            jsMeta.classNameBindings = valueElements.map(
              el => el.value
            );
          } else if (name === "concatenatedProperties") {
            jsMeta.concatenatedProperties = valueElements.map(
              el => el.value
            );
          } else if (name === "mergedProperties") {
            jsMeta.mergedProperties = valueElements.map(
              el => el.value
            );
          } else if (name === "positionalParams") {
            jsMeta.positionalParams = valueElements.map(
              el => el.value
            );
          } else if (valueType === "CallExpression") {
            let cname = path.node.value.callee.name;
            if (cname === "service") {
              jsMeta.computeds.push(
                name +
                  ' = service("' +
                  (path.node.value.arguments.length
                    ? path.node.value.arguments[0].value
                    : name) +
                  '")'
              );
              return;
            }
            let postfix = "";
            let ar = [];
            if (path.node.value.callee.type === "MemberExpression") {
              cname = path.node.value.callee.object.callee
                ? path.node.value.callee.object.callee.name
                : "<UNKNOWN>";
              postfix = path.node.value.callee.property.name + '()';

              path.node.value.callee.object.arguments.forEach(arg => {
                if (arg.type === "StringLiteral") {
                  jsMeta.unknownProps.push(arg.value);
                  ar.push(`'${arg.value}'`);
                }
              });

            }
           
            path.node.value.arguments.forEach(arg => {
              if (arg.type === "StringLiteral") {
                jsMeta.unknownProps.push(arg.value);
                ar.push(`'${arg.value}'`);
              }
            });
            if (path.node.value.arguments.length) {
              let isLastArgFn =
                path.node.value.arguments[path.node.value.arguments.length - 1]
                  .type === "FunctionExpression";
              if (isLastArgFn) {
                ar.push("fn() {...}");
              }
            }
            // path.node.value.arguments

            jsMeta.computeds.push(
              name +
                " = " +
                cname +
                "(" +
                ar.join(", ") +
                ")" +
                (postfix ? "." + postfix : "")
            );
          } else if (valueType === "NumericLiteral") {
            jsMeta.props.push(`${name} = ${path.node.value.value}`);
          } else if (valueType === "StringLiteral") {
            jsMeta.props.push(`${name} = "${path.node.value.value}"`);
          } else if (valueType === "BooleanLiteral") {
            jsMeta.props.push(`${name} = ${path.node.value.value}`);
          } else if (valueType === "NullLiteral") {
            jsMeta.props.push(`${name} = null `);
          } else if (valueType === "ObjectExpression") {
            jsMeta.props.push(`${name} = { ... } `);
          } else if (valueType === "ArrayExpression") {
            jsMeta.props.push(`${name} = [ ... ] `);
          } else if (valueType === "Identifier") {
            jsMeta.props.push(`${name} = ${path.node.value.name} `);
          } else if (valueType === "ArrowFunctionExpression") {
            jsMeta.props.push(`${name} = () => {} `);
          } else if (valueType === "ConditionalExpression") {
            jsMeta.props.push(`${name} = X ? Y : Z `);
          } else if (valueType === "TaggedTemplateExpression") {
            jsMeta.props.push(`${name} = ${path.node.value.tag.name}\`...\` `);
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
    computeds: [],
    props: [],
    unknownProps: [],
    attributeBindings: [],
    positionalParams: [],
    concatenatedProperties: [],
    mergedProperties: [],
    classNameBindings: [],
    classNames: [],
    exports: []
  };
}

function process(template) {
  let plugin = function() {
    return {
      visitor: {
        BlockStatement(node) {
          if (isLinkBlock(node)) {
            const linkPath = node.path.parts[0];
            if (!hbsMeta.links.includes(linkPath)) {
              hbsMeta.links.push(linkPath);
            }
          } else if (!node.path.original.includes('.') && !node.path.original.includes('-') && node.path.original !== 'component') {
            addUniqHBSMetaProperty("helpers", node.path.original);
          }
        },
        ElementNode(item) {
          if (item.tag.charAt(0) === item.tag.charAt(0).toUpperCase()) {
            addUniqHBSMetaProperty("components", item.tag);
          }
        },
        MustacheStatement(item) {
          if (
            item.path.original === "component" &&
            item.params[0].type === "StringLiteral"
          ) {
            addUniqHBSMetaProperty("components", item.params[0].original);
          } else {
            if (
              !item.path.original.includes(".") &&
              !item.path.original.includes("-")
            ) {
              addUniqHBSMetaProperty("helpers", item.path.original);
            }
          }
        },
        SubExpression(item) {
          if (
            item.path.original === "component" &&
            item.params[0].type === "StringLiteral"
          ) {
            addUniqHBSMetaProperty("components", item.params[0].original);
          } else {
            if (
              !item.path.original.includes(".") &&
              !item.path.original.includes("-")
            ) {
              addUniqHBSMetaProperty("helpers", item.path.original);
            }
          }
        },
        PathExpression(item) {
          const pathOriginal = item.original;
          if (item.data === true) {
            if (item.this === false) {
              addUniqHBSMetaProperty("arguments", pathOriginal);
            }
          } else if (item.this === true) {
            addUniqHBSMetaProperty("properties", pathOriginal);
          } else {
            if (pathOriginal.includes("/")) {
              addUniqHBSMetaProperty("components", pathOriginal);
            } else if (
              pathOriginal.includes("-") &&
              !pathOriginal.includes(".")
            ) {
              addUniqHBSMetaProperty("helpers", pathOriginal);
            } else {
              addUniqHBSMetaProperty("paths", pathOriginal);
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
  meta.imports = meta.imports.map(imp => {
    const paths = relativePath.split(path.sep);
    const base = imp.split("/")[0];
    paths.pop();
    if (imp.startsWith(".")) {
      const maybeFile = path.join(paths.join(path.sep), normalizePath(imp));
      const jsPath = maybeFile + ".js";
      const hbsPath = maybeFile + ".hbs";
      if (fs.existsSync(jsPath)) {
        return serializePath(jsPath);
      } else if (fs.existsSync(hbsPath)) {
        return serializePath(hbsPath);
      } else {
        return serializePath(maybeFile);
      }
    } else {
      if (imp.includes("/templates/components/")) {
        const pureImp = imp.replace(base, "");
        const [root] = serializePath(relativePath).split(base);
        const posiblePaths = [];
        posiblePaths.push(root + base + "/addon" + pureImp + ".js");
        posiblePaths.push(root + base + "/addon" + pureImp + ".hbs");
        posiblePaths.push(root + base + "/app" + pureImp + ".js");
        posiblePaths.push(root + base + "/app" + pureImp + ".hbs");
        let result = imp;
        posiblePaths.forEach(p => {
          if (fs.existsSync(normalizePath(p))) {
            result = serializePath(p);
          }
        });
        return result;
      } else if (imp.includes("/mixins/")) {
        const pureImp = imp.replace(base, "");
        const [root] = serializePath(relativePath).split(base);
        const posiblePaths = [];
        posiblePaths.push(root + base + "/addon" + pureImp + ".js");
        let result = imp;
        posiblePaths.forEach(p => {
          if (fs.existsSync(normalizePath(p))) {
            result = serializePath(p);
          }
        });
        return result;
      }
      return imp;
    }
  });
  meta.exports = meta.exports.map(imp => {
    if (imp.startsWith(".")) {
      const paths = relativePath.split(path.sep);
      paths.pop();
      const maybeFile = path.join(paths.join(path.sep), normalizePath(imp));
      const jsPath = maybeFile + ".js";
      const hbsPath = maybeFile + ".hbs";
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

function ignoredPaths() {
  return ['hasBlock', 'if', 'else', 'component', 'yield', 'hash', 'unless']
}
function showComponentTemplateInfo(template) {
  resetHBSMeta();
  process(template);
  // let printed = glimmer.print(ast);
  // paths
  const allStuff = Object.keys(hbsMeta)
    .filter(key => key !== "paths")
    .reduce((result, key) => {
      return result.concat(hbsMeta[key]);
    }, []).concat(ignoredPaths());
  hbsMeta.paths = hbsMeta.paths.filter(p => !allStuff.includes(p));
  return hbsMeta;
}

function getFileInformation(relativePath) {
  if (isJSFile(relativePath)) {
    return getComponentInformation(relativePath);
  } else {
    return getTemplateInformation(relativePath);
  }
}

module.exports = {
  name: require("./package").name,
  serverMiddleware: function(config) {
    config.app.get("/_/files", this.onFile.bind(this));
  },
  onFile(req, res) {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    const relativePath = normalizePath(req.query.item || "") || __dirname;
    const pathsToResolve =
      req.query.paths && req.query.paths.length
        ? req.query.paths.split(",").map(normalizePath)
        : [];
    const root = serializePath(__dirname);
    if (pathsToResolve.length) {
      Promise.all(pathsToResolve.map(getFileInformation)).then(result => {
        res.send({
          type: "results",
          data: result,
          root
        });
      });
    } else if (isSupportedFileType(relativePath)) {
      getFileInformation(relativePath).then(result => {
        result.path = req.query.item;
        result.root = root;
        res.send(result);
      });
    } else {
      getFilesFromPath(relativePath).then(result => {
        result.path = req.query.item;
        result.root = root;
        res.send(result);
      });
    }
  }
};

function isJSFile(relativePath) {
  return relativePath.endsWith(".js");
}
function isHBSFile(relativePath) {
  return relativePath.endsWith(".hbs");
}
function isSupportedFileType(relativePath) {
  return isJSFile(relativePath) || isHBSFile(relativePath);
}

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
    .map(serializePath)
    .filter(filterPath);

  return Promise.all(files.map(recursiveReadDirPromise)).then(results => {
    const files = [].concat
      .apply([], results)
      .sort()
      .map(serializePath);
    return {
      type: "path",
      data: files
    };
  });
}

function asyncReadFile(relativePath, reject, resolve) {
  fs.readFile(relativePath, "utf8", (err, data) => {
    if (err) {
      reject(err);
    } else {
      resolve(data);
    }
  });
}

function getComponentInformation(relativePath) {
  return new Promise((resolve, reject) => {
    asyncReadFile(relativePath, reject, data => {
      resolve({
        type: "component",
        relativePath: serializePath(relativePath),
        data: showComponentInfo(data, relativePath)
      });
    });
  });
}

function getTemplateInformation(relativePath) {
  return new Promise((resolve, reject) => {
    asyncReadFile(relativePath, reject, data => {
      resolve({
        type: "template",
        relativePath: serializePath(relativePath),
        data: showComponentTemplateInfo(data)
      });
    });
  });
}
