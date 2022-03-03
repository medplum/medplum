#!/usr/bin/env bash

npx npm-check-updates -u --packageFile package.json
npx npm-check-updates -u --packageFile packages/app/package.json
npx npm-check-updates -u --packageFile packages/core/package.json
npx npm-check-updates -u --packageFile packages/definitions/package.json
npx npm-check-updates -u --packageFile packages/docs/package.json
npx npm-check-updates -u --packageFile packages/fhirpath/package.json
npx npm-check-updates -u --packageFile packages/fhirtypes/package.json
npx npm-check-updates -u --packageFile packages/generator/package.json
npx npm-check-updates -u --packageFile packages/graphiql/package.json
npx npm-check-updates -u --packageFile packages/infra/package.json
npx npm-check-updates -u --packageFile packages/server/package.json
npx npm-check-updates -u --packageFile packages/ui/package.json

