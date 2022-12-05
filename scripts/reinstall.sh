#!/usr/bin/env bash

rm -rf node_modules
rm -rf packages/app/node_modules
rm -rf packages/cli/node_modules
rm -rf packages/core/node_modules
rm -rf packages/docs/node_modules
rm -rf packages/definitions/node_modules
rm -rf packages/docs/node_modules
rm -rf packages/fhirtypes/node_modules
rm -rf packages/generator/node_modules
rm -rf packages/graphiql/node_modules
rm -rf packages/infra/node_modules
rm -rf packages/server/node_modules
rm -rf packages/react/node_modules
rm package-lock.json
npm i --legacy-peer-deps
npm i

