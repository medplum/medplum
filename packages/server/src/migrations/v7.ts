import { PoolClient } from 'pg';

export async function run(client: PoolClient): Promise<void> {
  // Add the "owner" column
  await client.query('ALTER TABLE "Project" ADD COLUMN "owner" TEXT');

  // For each project, populate the "owner" column
  const projects = await client.query('SELECT "id", "content" FROM "Project"');
  for (const project of projects.rows) {
    const id = project.id;
    const obj = JSON.parse(project.content);
    const owner = obj.owner?.reference;
    if (owner) {
      await client.query('UPDATE "Project" SET "owner"=$1 WHERE "id"=$2', [owner, id]);
    }
  }
}
