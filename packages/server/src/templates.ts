import { Response } from 'express';
import { readdirSync, readFileSync } from 'fs';
import Mustache from 'mustache';
import { resolve } from 'path';

const templates: Record<string, string> = {};
readdirSync(resolve(__dirname, '../templates')).forEach((file) => {
  if (file.endsWith('.mustache')) {
    templates[file.replace('.mustache', '')] = readTemplate(file);
  }
});

function readTemplate(name: string): string {
  return readFileSync(resolve(__dirname, `../templates/${name}`), 'utf8');
}

export function renderTemplate(res: Response, name: string, view: any): Response<any, Record<string, any>> {
  return res.status(200).contentType('text/html').send(Mustache.render(templates[name], view, templates));
}
