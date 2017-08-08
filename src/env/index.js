const google = require('googleapis');
const path = require('path');
const fs = require('fs');
const propParser = require('properties-parser');
const curry = require('curry');

const runtimeConfig = google.runtimeconfig('v1beta1');
const localConfig = path.join(process.cwd(), '../.config');

const addVarsToEnvironment = (variables) =>
  Promise.resolve(Object.keys(variables).forEach((variable) => {
    process.env[variable] = variables[variable];
  }));

const ifLocalConfig = () =>
  new Promise((resolve) => {
    fs.exists(localConfig, resolve);
  });

const addVariableEntryToObject = (obj, variable) =>
  Object.assign(obj, {
    [variable.name.split('/').slice(-1)]: Buffer.from(variable.value, 'base64').toString(),
  });

const auth = () =>
  new Promise((resolve, reject) => {
    google.auth.getApplicationDefault((err, client) => {
      let authClient = client;
      if (err) {
        return reject(err);
      }

      if (authClient.createScopedRequired && authClient.createScopedRequired()) {
        const scopes = [
          'https://www.googleapis.com/auth/cloud-platform',
          'https://www.googleapis.com/auth/cloudruntimeconfig',
        ];
        authClient = authClient.createScoped(scopes);
      }
      return resolve(authClient);
    });
  });

const loadLocalFile = () =>
  new Promise((resolve, reject) =>
    propParser.read(localConfig, (err, config) => {
      if (err) {
        return reject();
      }
      return resolve(config);
    }));

const loadRuntimeConfig = (configName) =>
  new Promise((resolve, reject) =>
    auth().then((authClient) => {
      const projectId = process.env.GCLOUD_PROJECT;

      runtimeConfig.projects.configs.variables.list({
        auth: authClient,
        returnValues: true,
        parent: `projects/${projectId}/configs/${configName}`,
      }, (err, results) => {
        if (err) {
          return reject(err);
        }
        return resolve(results.variables.reduce(addVariableEntryToObject, {}));
      });
    }));

const load = (configName, next) => (req, res) =>
  ifLocalConfig()
    .then((exists) => {
      if (exists) {
        return loadLocalFile();
      }
      return loadRuntimeConfig(configName);
    })
    .then(addVarsToEnvironment)
    .then(() => next(req, res));

module.exports = curry(load);
