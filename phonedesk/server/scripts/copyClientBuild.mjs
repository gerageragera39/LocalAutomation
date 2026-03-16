import { access, cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");
const clientDist = path.resolve(serverRoot, "../client/dist");
const publicDir = path.resolve(serverRoot, "public");

const run = async () => {
  try {
    await access(clientDist);
  } catch {
    throw new Error("Сборка client не найдена. Сначала выполните `npm run build --prefix client`.");
  }

  await rm(publicDir, { recursive: true, force: true });
  await mkdir(publicDir, { recursive: true });
  await cp(clientDist, publicDir, { recursive: true });

  console.log("Client build скопирован в server/public");
};

run().catch((error) => {
  const message = error instanceof Error ? error.message : "Неизвестная ошибка";
  console.error(message);
  process.exit(1);
});
