import parse from "./parse";
import { Bot, Deployment, parseDeployment } from "./types";
import { dirname, resolve } from "path";
import { existsSync } from "fs";
import dotenv from "dotenv";
import { writeFile } from "fs/promises";
import { ChatBotKit } from "@chatbotkit/sdk";
import log from "./log";

const cache: any = {};

const getFilename = (fullPath: string) =>
  fullPath.replace(`${dirname(fullPath)}/`, "");

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

const namespace = ENV?.CHATBOTKIT_NAMESPACE || "";
const prefix = namespace ? `${namespace}-` : "";
const secret = ENV?.CHATBOTKIT_API_KEY || "";

if (!secret) {
  log.error(`Missing CHATBOTKIT_API_KEY in .env file.`);
  process.exit(1);
}

const withPrefix = (botName: string) =>
  botName.startsWith(prefix) ? botName : `${prefix}${botName}`;

const withoutPrefix = (botName: string) => botName.replace(`${prefix}`, "");

const cbk: ChatBotKit = new ChatBotKit({ secret });

const getCachedBot = async (botId: string) => {
  if (cache[botId]) {
    return cache[botId] as Awaited<ReturnType<typeof cbk.bot.fetch>>;
  }

  const bot = await cbk.bot.fetch(botId);
  cache[botId] = bot;
  return bot as Awaited<ReturnType<typeof cbk.bot.fetch>>;
};

const clearCachedBots = () => {
  for (let botId in cache) {
    delete cache[botId];
  }
};

/* -------------------------- CRUD OPERATIONS TODO -------------------------- */
const sdk_createBot = async (
  bot: Bot
): Promise<{ botId: string; botName: string }> => {
  clearCachedBots();

  const { system, name } = bot;
  const botName = withPrefix(name);

  log.verbose(`Initializing bot via API: ${withPrefix(botName)}`);
  const { id: botId } = await cbk.bot.create({
    model: "gpt-4-next",
    name: botName,
    description: "A bot created by the bot-scripts/deploy.ts script",
    backstory: system.backstory,
  });

  log.verbose(
    `Initializing bot's dataset and skillset via API: ${withPrefix(botName)}`
  );
  const [{ id: datasetId }, { id: skillsetId }] = await Promise.all([
    cbk.dataset.create({
      store: "ada-sprout",
      name: botName,
      description: "A dataset created by the bot-scripts/deploy.ts script",
      matchInstruction: system.matched,
      mismatchInstruction: system.mismatched,
      meta: {
        botId,
      },
    }),
    cbk.skillset.create({
      name: botName,
      description: "A skillset created by the bot-scripts/deploy.ts script",
      meta: {
        botId,
      },
    }),
  ]);

  log.verbose(`Attaching skillset and dataset to bot: ${withPrefix(botName)}`);
  await cbk.bot.update(botId, {
    datasetId,
    skillsetId,
  });

  return {
    botName,
    botId,
  };
};

const sdk_exists = async (botId: string) => {
  try {
    log.verbose(`Checking if bot exists: ${botId}`);
    const bot = await cbk.bot.fetch(botId);
    return !!bot?.id;
  } catch (err: any) {
    console.log(err.message);
    return false;
  }
};

const sdk_updateBotSystem = async (botId: string, system: Bot["system"]) => {
  const { datasetId } = await getCachedBot(botId);
  log.verbose(
    `Updating dataset matchInstruction and mismatchInstruction: ${datasetId}`
  );
  await cbk.dataset.update(datasetId as string, {
    matchInstruction: system.matched,
    mismatchInstruction: system.mismatched,
  });
  log.verbose(`Updating bot backstory: ${botId}`);
  await cbk.bot.update(botId, {
    backstory: system.backstory,
  });
};

const sdk_updateName = async (botId: string, newName: string) => {
  const botName = withPrefix(newName);
  const bot = await cbk.bot.fetch(botId);

  log.verbose(`Updating bot name: ${bot.name} -> ${botName}`);
  await cbk.bot.update(botId, {
    name: botName,
  });

  log.verbose(`Updating dataset name: ${bot.name} -> ${botName}`);
  await cbk.dataset.update(bot.datasetId as string, {
    name: botName,
  });

  log.verbose(`Updating skillset name: ${bot.name} -> ${botName}`);
  await cbk.skillset.update(bot.skillsetId as string, {
    name: botName,
  });
};

const sdk_detachDatasetFiles = async (botId: string) => {
  const { items } = await cbk.file.list();
  const associatedFiles = items.filter(
    (item: any) => item.meta?.botId === botId
  );

  log.verbose(
    `Detaching ${associatedFiles.length} dataset files for bot: ${botId}`
  );
  for (let item of associatedFiles) {
    log.verbose(`Deleting file: ${item.name}`);
    await cbk.file.delete(item.id as string);
  }
};

const sdk_attachDatasetFiles = async (
  botId: string,
  datasetFiles: Bot["datasetFiles"]
) => {
  const { datasetId } = await getCachedBot(botId);
  for (let datasetFile of datasetFiles) {
    log.verbose(`Creating dataset file: ${datasetFile.filePath}`);
    const { id: fileId } = await cbk.file.create({
      name: getFilename(datasetFile.filePath),
      description: "A file created by the bot-scripts/deploy.ts script",
      meta: {
        botId,
      },
    });

    log.verbose(`Uploading dataset file: ${datasetFile.filePath}`);
    const fileName = getFilename(datasetFile.filePath);
    await cbk.file.upload(fileId, {
      name: fileName,
      type: "text/csv",
      data: new TextEncoder().encode(datasetFile.contents),
    });

    log.verbose(`Attaching dataset file: ${datasetFile.filePath}`);
    await cbk.dataset.file.attach(datasetId as string, fileId, {
      type: "source",
    });
  }
};

const sdk_removeSkills = async (botId: string) => {
  const { skillsetId } = await getCachedBot(botId);
  const { items } = await cbk.skillset.ability.list(skillsetId as string);
  for (let item of items) {
    log.verbose(`Removing skill ability: ${item.name}`);
    await cbk.skillset.ability.delete(skillsetId as string, item.id as string);
  }
};

const sdk_createSkills = async (botId: string, skills: Bot["skills"]) => {
  const { skillsetId } = await getCachedBot(botId);
  for (let skill of skills) {
    log.verbose(`Creating skill ability: ${skill.name}`);
    await cbk.skillset.ability.create(skillsetId as string, {
      name: skill.name,
      description: skill.description,
      instruction: skill.instruction,
      meta: {
        botId,
      },
    });
  }
};

/* -------------------------- CRUD OPERATIONS TODO -------------------------- */

const cleanupIncompleteBot = async (botId: string) => {
  // Reset the bot cache to be safe
  clearCachedBots();

  // Get the dataset and skillset for the bot
  const { items: datasets } = await cbk.dataset.list();
  const dataset = datasets.find((d: any) => d.meta?.botId === botId);
  const { items: skillsets } = await cbk.skillset.list();
  const skillset = skillsets.find((s: any) => s.meta?.botId === botId);

  // Attempt to delete the bot, dataset, and skillset
  try {
    if (skillset) {
      log.verbose(`Deleting skillset for incomplete bot: ${botId}`);
      await cbk.skillset.delete(skillset.id);
      log.warn(`Force removed skills from bot: ${botId}`);
    }
  } catch (err) {
    console.error(err);
    log.error(`Failed to remove skills from bot: ${botId}`);
  }
  try {
    if (dataset) {
      log.verbose(`Deleting dataset for incomplete bot: ${botId}`);
      await cbk.dataset.delete(dataset.id);
      log.warn(`Force removed skills from bot: ${botId}`);
    }
  } catch (err) {
    console.error(err);
    log.error(`Failed to remove skills from bot: ${botId}`);
  }
  try {
    log.verbose(`Deleting incomplete bot: ${botId}`);
    await cbk.bot.delete(botId);
    log.warn(`Force deleted bot: ${botId}`);
  } catch (err) {
    console.error(err);
    log.error(`Failed to delete bot: ${botId}`);
  }
};

const createBot = async (bot: Bot) => {
  // Create the bot and get the botId
  const { botId } = await sdk_createBot(bot);
  log.info(`Created ignorant bot`, `${withPrefix(bot.name)}`);

  try {
    // Ensure that the deployment info is correct before creating
    // the dataset files and skills.
    const nextDeployment = parseDeployment({
      botId,
      name: withPrefix(bot.name),
      updatedAt: new Date().toString(),
      datasetFiles: bot.datasetFiles.map((b) => ({
        fileName: getFilename(b.filePath),
        updatedAt: new Date().toString(),
      })),
      skills: bot.skills.map((b) => ({
        name: b.name,
        updatedAt: new Date().toString(),
      })),
    });

    // Attach the dataset files and create the skills
    await sdk_attachDatasetFiles(nextDeployment.botId, bot.datasetFiles);
    log.info(
      `Attached dataset files to bot`,
      ` ${withPrefix(nextDeployment.name)}`
    );
    await sdk_createSkills(nextDeployment.botId, bot.skills);
    log.info(`Created skills for bot`, ` ${withPrefix(nextDeployment.name)}`);

    return nextDeployment;
  } catch (err: any) {
    if (err?.message) log.error(err.message);
    console.error(err);
    await cleanupIncompleteBot(botId);
    process.exit(1);
  }
};

const updateBot = async (bot: Bot) => {
  const botId = (bot.deployment as Deployment).botId;

  // Ensure that the deployment info is correct
  // before making requests.
  const nextDeployment = parseDeployment({
    botId,
    name: withPrefix(bot.name),
    updatedAt: new Date().toString(),
    datasetFiles: bot.datasetFiles.map((b) => ({
      fileName: getFilename(b.filePath),
      updatedAt: new Date().toString(),
    })),
    skills: bot.skills.map((s) => ({
      name: s.name,
      updatedAt: new Date().toString(),
    })),
  });

  // Update the bot name if it has changed
  const prevName = (bot.deployment as Deployment).name;
  if (nextDeployment.name !== prevName) {
    await sdk_updateName(nextDeployment.botId, nextDeployment.name);
    log.info(
      `Updated bot name`,
      `${withPrefix(prevName)} => ${withPrefix(nextDeployment.name)}`
    );
  }

  await sdk_updateBotSystem(nextDeployment.botId, bot.system);
  log.info(`Updated system prompts`);

  await sdk_detachDatasetFiles(nextDeployment.botId);
  log.info(`Detached dataset files`);

  await sdk_removeSkills(nextDeployment.botId);
  log.info(`Removed abilities`);

  await sdk_attachDatasetFiles(nextDeployment.botId, bot.datasetFiles);
  log.info(`Re-uploaded and attached files to dataset`);

  await sdk_createSkills(nextDeployment.botId, bot.skills);
  log.info(`Recreated abilities`);

  return nextDeployment;
};

const build = async () => {
  try {
    const botsDirname = "bots";
    const botsDir = resolve(process.cwd(), botsDirname);
    const bots = await parse(botsDir);

    const startTime = Date.now();

    log.wait(
      `Deploying ${Object.keys(bots).length} bots`,
      Object.keys(bots)
        .map((name) => withPrefix(name))
        .join(", ")
    );

    // Loop through the bots that were built using the filesystem and
    // dynamic function.
    for (let botName in bots) {
      const bot = bots[botName];
      const botId = bot.deployment?.botId as string;

      // Reset the bot cache to be safe
      clearCachedBots();

      // Check if the bot already exists
      const foundDeploy = botId ? await sdk_exists(botId) : false;

      // Reset the bot cache to be safe
      clearCachedBots();

      // If the bot exists, update it. Otherwise, create it.
      const deployment = foundDeploy
        ? await updateBot(bot)
        : await createBot(bot);

      foundDeploy
        ? log.info(`Updated previously deployed bot`, `${withPrefix(botName)}`)
        : log.info(`Deployed new bot`, `${withPrefix(botName)}`);

      // Store the deployment info in the bot's directory
      await writeFile(
        resolve(botsDir, withoutPrefix(botName), "deployment.json"),
        JSON.stringify(deployment, null, 2)
      );

      log.info(`Stored deployment info for bot`, `${withPrefix(botName)}`);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    log.success(`Deployed all bots in `, `${duration / 1000} seconds`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

build();
