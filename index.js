"use strict";
const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");
const glimmer = require("@glimmer/syntax");

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

let componentAnalyzer = function() {
  // console.log(Object.keys(babel.file));
  return {
    pre() {
      fileMeta = {};
    },
    visitor: {
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
          }
        },
        ElementNode(item) {
          if (item.tag.charAt(0) === item.tag.charAt(0).toUpperCase()) {
            if (!hbsMeta.components.includes(item.tag)) {
              hbsMeta.components.push(item.tag);
            }
          }
        },
        PathExpression(item) {
          if (item.data === true) {
            if (item.this === false) {
              hbsMeta.arguments.push(item.original);
            }
          } else if (item.this === true) {
            hbsMeta.properties.push(item.original);
          } else {
            if (item.original.includes("-") && !item.original.includes(".")) {
              if (!hbsMeta.helpers.includes(item.original)) {
                hbsMeta.helpers.push(item.original);
              }
            } else {
              hbsMeta.paths.push(item.original);
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
  serverMiddleware: function(config) {
    config.app.get("/_/files", this.onFile.bind(this));
  },
  showComponentInfo(data) {
    const options = {
      plugins: [componentAnalyzer]
    };
    return babel.transform(data, options).metadata;
  },
  showComponentTemplateInfo(template) {
    resetHBSMeta();
    process(template);
    // let printed = glimmer.print(ast);
    return hbsMeta;
  },
  onFile(req, res) {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    const relativePath =
      (req.query.item || "").split("/").join(path.sep) || __dirname;
    // console.log('relativePath', relativePath);
    // console.log('endsWith - js', relativePath.endsWith('.js'));
    // console.log('relativePath - hbs', relativePath.endsWith('.hbs'));

    if (relativePath.endsWith(".js")) {
      // console.log('read JS');
      fs.readFile(relativePath, "utf8", (err, data) => {
        return res.send({
          type: "component",
          path: req.query.item,
          data: this.showComponentInfo(data)
        });
      });
    } else if (relativePath.endsWith(".hbs")) {
      fs.readFile(relativePath, "utf8", (err, data) => {
        return res.send({
          type: "template",
          path: req.query.item,
          data: this.showComponentTemplateInfo(data)
        });
      });
    } else {
      const files = fs
        .readdirSync(relativePath)
        .map(name => relativePath + path.sep + name)
        .map(item => item.split(path.sep).join("/"));
      res.send({
        type: "path",
        path: req.query.item,
        data: files
      });
    }
  }
};
