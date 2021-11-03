#!/usr/bin/env bash

npx ncu -u --packageFile package.json
npx ncu -u --packageFile packages/app/package.json
npx ncu -u --packageFile packages/core/package.json
npx ncu -u --packageFile packages/definitions/package.json
npx ncu -u --packageFile packages/docs/package.json
npx ncu -u --packageFile packages/generator/package.json
npx ncu -u --packageFile packages/graphiql/package.json
npx ncu -u --packageFile packages/infra/package.json
npx ncu -u --packageFile packages/server/package.json
npx ncu -u --packageFile packages/ui/package.json

