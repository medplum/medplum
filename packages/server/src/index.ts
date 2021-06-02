import express from 'express';
import { initApp } from './app';

async function main() {
  const app = await initApp(express())
  app.listen(5000);
}

main();
