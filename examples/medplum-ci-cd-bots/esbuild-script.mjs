import { build } from 'esbuild';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./medplum.config.json', 'utf8'));

async function buildBots() {
  for (const bot of config.bots) {
    console.log(`Building ${bot.name}...`);

    try {
      await build({
        entryPoints: [bot.source],
        bundle: true,
        platform: 'node',
        target: 'node20',
        outfile: bot.dist, // Single output file for each bot
        format: 'cjs', // CommonJS format for Medplum bots
        external: ['@medplum/core', '@medplum/fhirtypes'],
        sourcemap: true,
        minify: false,
        define: {
          'process.env.NODE_ENV': '"production"',
        },
        // This footer ensures proper CommonJS exports
        footer: { js: 'Object.assign(exports, module.exports);' },
      });
      
      console.log(`✅ Built ${bot.name} -> ${bot.dist}`);
    } catch (error) {
      console.error(`❌ Failed to build ${bot.name}:`, error);
      process.exit(1);
    }
  }
}

buildBots().catch(console.error);
