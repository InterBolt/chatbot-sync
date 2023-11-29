import { existsSync, unlinkSync } from "fs";
import { readdir } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import log from "./log";

const __dirname = dirname(fileURLToPath(import.meta.url));

const main = async () => {
  const botDir = resolve(__dirname, "..", "bots");
  const bots = await readdir(botDir);
  bots.forEach((bot) => {
    const deploymentFile = resolve(botDir, bot, "deployment.json");
    if (existsSync(deploymentFile)) {
      unlinkSync(deploymentFile);
      log.warn(`Deleted ${deploymentFile}`);
    }
  });
};

main();
