import { existsSync, unlinkSync } from "fs";
import { readdir } from "fs/promises";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import log from "./log";
import dotenv from "dotenv";

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

const pathToEnv = resolve(process.cwd(), ".env");

if (!existsSync(pathToEnv)) {
  log.error(
    `Missing .env file in the root of the project. If you just cloned the repo, run "mv example-env .env".`
  );
  process.exit(1);
}

const { parsed: ENV } = dotenv.config({
  path: resolve(process.cwd(), ".env"),
});

if (ENV?.USER === "maintainer") {
  main();
  log.success("Removed deployments for maintainer.");
} else {
  log.success("Persisted deployments for non-maintainer.");
}
