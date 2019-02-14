"use strict";

const {
  serializePath,
  normalizePath,
  isSupportedFileType,
  isJSFile,
  getFilesFromPath,
  asyncReadFile
} = require("./utils/file-utils");

const { processTemplate,  processJSFile, extractComponentInformationFromMeta } = require("ember-meta-explorer");

function showComponentInfo(data, relativePath) {
  return processJSFile(data, relativePath);
}

function showComponentTemplateInfo(template) {
  return processTemplate(template);
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
    config.app.get("/_/meta", this.onMeta.bind(this));
  },
  onMeta(req, res) {
    const meta = JSON.parse(req.query.data || '');
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    if (!meta) {
      res.send({}); 
    } else {
      res.send(extractComponentInformationFromMeta(meta));
    }
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
