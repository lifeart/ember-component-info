"use strict";

/* eslint-env node */

const glimmer = require("@glimmer/syntax");

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

function ignoredPaths() {
  return ["hasBlock", "if", "else", "component", "yield", "hash", "unless"];
}

function plugin() {
  return {
    visitor: {
      BlockStatement(node) {
        if (isLinkBlock(node)) {
          const linkPath = node.path.parts[0];
          if (!hbsMeta.links.includes(linkPath)) {
            hbsMeta.links.push(linkPath);
          }
        } else if (
          !node.path.original.includes(".") &&
          !node.path.original.includes("-") &&
          node.path.original !== "component"
        ) {
          addUniqHBSMetaProperty("helpers", node.path.original);
        } else if (
          node.pathOriginal !== "component" &&
          node.path.original.includes("-")
        ) {
          addUniqHBSMetaProperty("components", node.path.original);
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
}

function process(template) {
  resetHBSMeta();

  glimmer.preprocess(template, {
    plugins: {
      ast: [plugin]
    }
  });

  const ignored = ignoredPaths();
  const allStuff = Object.keys(hbsMeta)
    .filter(key => key !== "paths")
    .reduce((result, key) => {
      return result.concat(hbsMeta[key]);
    }, []);
  hbsMeta.paths = hbsMeta.paths
    .filter(p => !allStuff.includes(p))
    .filter(p => !ignored.includes(p));
  hbsMeta.helpers = hbsMeta.helpers.filter(
    n => !hbsMeta.components.includes(n)
  );
  hbsMeta.properties = hbsMeta.properties.filter(p => !ignored.includes(p));

  return JSON.parse(JSON.stringify(hbsMeta));
}

module.exports = {
  resetHBSMeta,
  processTemplate: process
};
