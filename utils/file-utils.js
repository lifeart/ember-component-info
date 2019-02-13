"use strict";

/* eslint-env node */
const path = require("path");
const fs = require("fs");
const recursive = require("recursive-readdir");

function serializePath(file) {
  return file.split(path.sep).join("/");
}

function normalizePath(file) {
  return file.split("/").join(path.sep);
}

function isJSFile(relativePath) {
  return relativePath.endsWith(".js");
}

function isHBSFile(relativePath) {
  return relativePath.endsWith(".hbs");
}

function isSupportedFileType(relativePath) {
  return isJSFile(relativePath) || isHBSFile(relativePath);
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

// * will be deprecated
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

// * will be deprecated
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

  function getFilesFromPath(relativePath) {
    if (!fs.existsSync(relativePath)) {
      return Promise.resolve({
        type: "path",
        status: 404,
        data: []
      });
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

module.exports = {
  isJSFile,
  serializePath,
  normalizePath,
  isSupportedFileType,
  filterPath,
  getFilesFromPath,
  recursiveReadDirPromise,
  asyncReadFile
};
