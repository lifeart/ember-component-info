"use strict";

/* eslint-env node */
const babel = require("@babel/core");
const path = require("path");
const fs = require("fs");
const { serializePath, normalizePath } = require("./file-utils");

let jsMeta = {};

function extractActions(path) {
  return path.node.value.properties.map(node => {
    const params = node.params.map(p => p.name);
    return `${node.key.name}(${params.join(", ")})`;
  });
}

function extractClassNames(path) {
  return path.node.value.elements.map(el => el.value);
}

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
          const params = method.params.map(p => p.name);
          jsMeta.functions.push(`${method.key.name}(${params.join(", ")})`);
        });
      },
      ObjectProperty(path) {
        if (path.parent.type === "ObjectExpression" && !path.scope.parent) {
          const valueType = path.node.value.type;
          const name = path.node.key.name;
          const valueElements = path.node.value.elements || [];
          if (name === "actions") {
            jsMeta.actions = extractActions(path);
          } else if (name === "classNames") {
            jsMeta.classNames = extractClassNames(path);
          } else if (name === "tagName" && valueType === "StringLiteral") {
            jsMeta.tagNames = [path.node.value.value];
          } else if (name === "attributeBindings") {
            valueElements
              .map(el => el.value)
              .forEach(value => {
                jsMeta.unknownProps.push(value.split(":")[0]);
              });

            jsMeta.attributeBindings = valueElements.map(el => el.value);
          } else if (name === "classNameBindings") {
            valueElements
              .map(el => el.value)
              .forEach(value => {
                jsMeta.unknownProps.push(value.split(":")[0]);
              });

            jsMeta.classNameBindings = valueElements.map(el => el.value);
          } else if (name === "concatenatedProperties") {
            jsMeta.concatenatedProperties = valueElements.map(el => el.value);
          } else if (name === "mergedProperties") {
            jsMeta.mergedProperties = valueElements.map(el => el.value);
          } else if (name === "positionalParams") {
            jsMeta.positionalParams = valueElements.map(el => el.value);
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
              postfix = path.node.value.callee.property.name + "()";

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

function processJSFile(data, relativePath) {
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

module.exports = {
  processJSFile
};
